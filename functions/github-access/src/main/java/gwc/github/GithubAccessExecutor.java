package gwc.github;

import com.google.cloud.functions.HttpFunction;
import com.google.cloud.functions.HttpRequest;
import com.google.cloud.functions.HttpResponse;
import com.google.gson.Gson;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static java.lang.String.join;
import static java.net.HttpURLConnection.*;
import static java.net.URLEncoder.encode;
import static java.net.http.HttpRequest.newBuilder;
import static java.net.http.HttpResponse.BodyHandlers.ofString;
import static java.nio.charset.StandardCharsets.UTF_8;
import static java.util.Objects.requireNonNull;
import static java.util.stream.Collectors.joining;

public class GithubAccessExecutor implements HttpFunction {

  public static final Pattern COOKIE_PATTERN = Pattern.compile("state=([\\w-]{36})");
  private static final String GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";

  public static final Pattern SESSION_COOKIE_PATTERN = Pattern.compile("gwc_session=([\\w.\\-]+)");

  private final String clientId;
  private final String clientSecret;
  private final String redirectUri;
  private final String frontendOrigin;
  private final URI tokenExchangeUrl;
  private final String githubApiBaseUrl;
  // Generate the SecretKey with KeyGen in src/test/groovy.
  // Never log the codec's input tokens or its output blobs.
  private final SessionTokenCodec sessionCodec;

  public GithubAccessExecutor() {
    this(Config.fromEnv());
  }

  GithubAccessExecutor(Config config) {
    this.clientId = config.clientId();
    this.clientSecret = config.clientSecret();
    this.redirectUri = config.redirectUri();
    this.frontendOrigin = config.frontendOrigin();
    this.tokenExchangeUrl = URI.create(config.tokenExchangeUrl());
    this.githubApiBaseUrl = config.githubApiBaseUrl();
    this.sessionCodec = new SessionTokenCodec(config.secretKey());
  }

  // Create a client with some reasonable defaults. This client can be reused for multiple requests.
  // (java.net.httpClient also pools connections automatically by default.)
  private static final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

  private static final Gson GSON = new Gson();

  @Override
  public void service(HttpRequest httpRequest, HttpResponse httpResponse) throws Exception {
    try {
      handleRequest(httpRequest, httpResponse);
    } catch (UnauthorizedException e) {
      httpResponse.setStatusCode(HTTP_UNAUTHORIZED);
    } catch (Exception e) {
      httpResponse.setStatusCode(HTTP_INTERNAL_ERROR);
    }
  }

  private void handleRequest(HttpRequest httpRequest, HttpResponse httpResponse) throws Exception {
    var method = httpRequest.getMethod();
    if (method.equals("OPTIONS")) {
      handlePreflight(httpRequest, httpResponse);
      return;
    }
    if (isStateChanging(method)) {
      if (!originAllowed(httpRequest)) {
        httpResponse.setStatusCode(HTTP_FORBIDDEN);
        return;
      }
      addCorsHeaders(httpRequest, httpResponse);
      handleStateChangingRequest(httpRequest, httpResponse);
      return;
    }
    if (method.equals("GET")) {
      addCorsHeaders(httpRequest, httpResponse);
      var parameters = httpRequest.getQueryParameters();

      if (parameters.containsKey("error")) {
        handleErrorResponse(httpResponse, parameters);
      } else if (parameters.containsKey("action") && getFirstHeaderValue(parameters, "action").equals("login")) {
        handleAuthRequest(httpResponse);
      } else if (parameters.containsKey("action") && getFirstHeaderValue(parameters, "action").equals("me")) {
        handleMe(httpRequest, httpResponse);
      } else if (parameters.containsKey("action") && getFirstHeaderValue(parameters, "action").equals("gist")) {
        handleGistGet(httpRequest, httpResponse);
      } else if (parameters.containsKey("code") && parameters.containsKey("state")) {
        handleAuthResponse(httpRequest, httpResponse);
      }
    }
  }

  private void handleMe(HttpRequest httpRequest, HttpResponse httpResponse) throws Exception {
    var token = decryptSessionCookie(httpRequest);
    if (token.isEmpty()) {
      httpResponse.setStatusCode(HTTP_UNAUTHORIZED);
      return;
    }
    var userRequest = newBuilder().uri(URI.create(githubApiBaseUrl + "/user"))
      .GET()
      .header("Accept", "application/json")
      .header("Authorization", "Bearer " + token.get().getAccess_token())
      .build();
    var userResponse = client.send(userRequest, ofString());
    if (userResponse.statusCode() == HTTP_UNAUTHORIZED) {
      httpResponse.setStatusCode(HTTP_UNAUTHORIZED);
      return;
    }
    if (userResponse.statusCode() != HTTP_OK) {
      httpResponse.setStatusCode(userResponse.statusCode());
      return;
    }
    var fromGithub = GSON.fromJson(userResponse.body(), Map.class);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("login", fromGithub.get("login"));
    out.put("avatar_url", fromGithub.get("avatar_url"));
    httpResponse.setStatusCode(HTTP_OK);
    httpResponse.setContentType("application/json");
    try (var writer = httpResponse.getWriter()) {
      writer.write(GSON.toJson(out));
    }
  }

  private void handleGistGet(HttpRequest httpRequest, HttpResponse httpResponse) throws Exception {
    var token = decryptSessionCookie(httpRequest);
    if (token.isEmpty()) {
      httpResponse.setStatusCode(HTTP_UNAUTHORIZED);
      return;
    }
    var parameters = httpRequest.getQueryParameters();
    if (!parameters.containsKey("id")) {
      httpResponse.setStatusCode(HTTP_BAD_REQUEST);
      return;
    }
    var id = getFirstHeaderValue(parameters, "id");
    var gistRequest = newBuilder().uri(URI.create(githubApiBaseUrl + "/gists/" + id))
      .GET()
      .header("Accept", "application/vnd.github+json")
      .header("Authorization", "Bearer " + token.get().getAccess_token())
      .build();
    var gistResponse = client.send(gistRequest, ofString());
    if (gistResponse.statusCode() != HTTP_OK) {
      httpResponse.setStatusCode(gistResponse.statusCode());
      return;
    }
    var gist = GSON.fromJson(gistResponse.body(), Map.class);
    var groovyFile = pickGroovyFile(gist);
    if (groovyFile == null) {
      httpResponse.setStatusCode(HTTP_BAD_REQUEST);
      try (var writer = httpResponse.getWriter()) {
        writer.write("No non-truncated Groovy file in this gist.");
      }
      return;
    }
    var owner = (Map<?, ?>) gist.get("owner");
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", gist.get("id"));
    out.put("filename", groovyFile.get("filename"));
    out.put("code", groovyFile.get("content"));
    out.put("ownerLogin", owner == null ? null : owner.get("login"));
    out.put("public", gist.get("public"));
    httpResponse.setStatusCode(HTTP_OK);
    httpResponse.setContentType("application/json");
    try (var writer = httpResponse.getWriter()) {
      writer.write(GSON.toJson(out));
    }
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> pickGroovyFile(Map<?, ?> gist) {
    var files = (Map<String, Map<String, Object>>) gist.get("files");
    if (files == null) return null;
    // GitHub returns files as a JSON object — Gson preserves insertion order, but the
    // ordering of object keys is not guaranteed by GitHub. Sort by filename so a GET
    // and a subsequent PATCH always target the same Groovy file when multiple exist.
    return files.entrySet().stream()
      .sorted(Map.Entry.comparingByKey())
      .map(Map.Entry::getValue)
      .filter(file -> Boolean.FALSE.equals(file.get("truncated")) && "Groovy".equals(file.get("language")))
      .findFirst()
      .orElse(null);
  }

  private Optional<TokenResponse> decryptSessionCookie(HttpRequest httpRequest) {
    var cookies = httpRequest.getHeaders().get("Cookie");
    if (cookies == null) return Optional.empty();
    return cookies.stream()
      .map(SESSION_COOKIE_PATTERN::matcher)
      .filter(Matcher::find)
      .map(matcher -> {
        try {
          return sessionCodec.decrypt(matcher.group(1));
        } catch (Exception ignored) {
          return null;
        }
      })
      .filter(Objects::nonNull)
      .findFirst();
  }

  private boolean isStateChanging(String method) {
    return method.equals("POST") || method.equals("PATCH") || method.equals("DELETE");
  }

  private boolean originAllowed(HttpRequest httpRequest) {
    var origin = firstHeader(httpRequest.getHeaders(), "Origin");
    return origin.isPresent() && origin.get().equals(frontendOrigin);
  }

  private void handleStateChangingRequest(HttpRequest httpRequest, HttpResponse httpResponse) throws Exception {
    var parameters = httpRequest.getQueryParameters();
    var action = parameters.containsKey("action") ? getFirstHeaderValue(parameters, "action") : "";
    var method = httpRequest.getMethod();
    if (method.equals("POST") && action.equals("logout")) {
      handleLogout(httpResponse);
    } else if (method.equals("POST") && action.equals("gist")) {
      handleGistCreate(httpRequest, httpResponse);
    } else if (method.equals("PATCH") && action.equals("gist")) {
      handleGistUpdate(httpRequest, httpResponse);
    }
  }

  private void handleGistUpdate(HttpRequest httpRequest, HttpResponse httpResponse) throws Exception {
    var token = decryptSessionCookie(httpRequest);
    if (token.isEmpty()) {
      httpResponse.setStatusCode(HTTP_UNAUTHORIZED);
      return;
    }
    var parameters = httpRequest.getQueryParameters();
    if (!parameters.containsKey("id")) {
      httpResponse.setStatusCode(HTTP_BAD_REQUEST);
      return;
    }
    var id = getFirstHeaderValue(parameters, "id");
    var body = readJsonBody(httpRequest);
    var filename = body.get("filename") instanceof String f ? f.trim() : "";
    var code = body.get("code") instanceof String c ? c : null;
    if (filename.isEmpty() || code == null) {
      httpResponse.setStatusCode(HTTP_BAD_REQUEST);
      return;
    }
    var output = body.get("output") instanceof String o ? o : null;

    var files = new LinkedHashMap<String, Map<String, String>>();
    files.put(filename, Map.of("content", code));
    if (output != null) {
      files.put("output.txt", Map.of("content", output));
    }
    Map<String, Object> updateBody = Map.of("files", files);

    var gistRequest = newBuilder().uri(URI.create(githubApiBaseUrl + "/gists/" + id))
      .method("PATCH", java.net.http.HttpRequest.BodyPublishers.ofString(GSON.toJson(updateBody)))
      .header("Accept", "application/vnd.github+json")
      .header("Content-Type", "application/json")
      .header("Authorization", "Bearer " + token.get().getAccess_token())
      .build();
    var gistResponse = client.send(gistRequest, ofString());
    if (gistResponse.statusCode() != HTTP_OK) {
      httpResponse.setStatusCode(gistResponse.statusCode());
      return;
    }
    var updated = GSON.fromJson(gistResponse.body(), Map.class);
    Map<String, Object> out = Map.of("id", updated.get("id"));
    httpResponse.setStatusCode(HTTP_OK);
    httpResponse.setContentType("application/json");
    try (var writer = httpResponse.getWriter()) {
      writer.write(GSON.toJson(out));
    }
  }

  private void handleGistCreate(HttpRequest httpRequest, HttpResponse httpResponse) throws Exception {
    var token = decryptSessionCookie(httpRequest);
    if (token.isEmpty()) {
      httpResponse.setStatusCode(HTTP_UNAUTHORIZED);
      return;
    }
    var body = readJsonBody(httpRequest);
    var name = body.get("name") instanceof String s ? s.trim() : "";
    if (name.isEmpty()) {
      httpResponse.setStatusCode(HTTP_BAD_REQUEST);
      return;
    }
    var isPublic = Boolean.TRUE.equals(body.get("public"));
    var code = body.get("code") instanceof String c ? c : null;
    if (code == null) {
      httpResponse.setStatusCode(HTTP_BAD_REQUEST);
      return;
    }
    var output = body.get("output") instanceof String o ? o : null;

    var groovyFilename = slug(name) + ".groovy";
    var files = new LinkedHashMap<String, Map<String, String>>();
    files.put(groovyFilename, Map.of("content", code));
    if (output != null) {
      files.put("output.txt", Map.of("content", output));
    }
    Map<String, Object> createBody = new LinkedHashMap<>();
    createBody.put("description", name);
    createBody.put("public", isPublic);
    createBody.put("files", files);

    var gistRequest = newBuilder().uri(URI.create(githubApiBaseUrl + "/gists"))
      .POST(java.net.http.HttpRequest.BodyPublishers.ofString(GSON.toJson(createBody)))
      .header("Accept", "application/vnd.github+json")
      .header("Content-Type", "application/json")
      .header("Authorization", "Bearer " + token.get().getAccess_token())
      .build();
    var gistResponse = client.send(gistRequest, ofString());
    if (gistResponse.statusCode() != HTTP_CREATED && gistResponse.statusCode() != HTTP_OK) {
      httpResponse.setStatusCode(gistResponse.statusCode());
      return;
    }
    var created = GSON.fromJson(gistResponse.body(), Map.class);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", created.get("id"));
    out.put("filename", groovyFilename);
    out.put("public", created.get("public"));
    httpResponse.setStatusCode(HTTP_OK);
    httpResponse.setContentType("application/json");
    try (var writer = httpResponse.getWriter()) {
      writer.write(GSON.toJson(out));
    }
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> readJsonBody(HttpRequest httpRequest) throws IOException {
    try (var reader = httpRequest.getReader()) {
      Map<String, Object> parsed = GSON.fromJson(reader, Map.class);
      return parsed == null ? Map.of() : parsed;
    }
  }

  static String slug(String name) {
    var ascii = name.toLowerCase(Locale.ROOT)
      .replaceAll("[^a-z0-9]+", "-")
      .replaceAll("^-+|-+$", "");
    if (ascii.length() > 64) {
      ascii = ascii.substring(0, 64).replaceAll("-+$", "");
    }
    return ascii.isEmpty() ? "script" : ascii;
  }

  private void handleLogout(HttpResponse httpResponse) {
    httpResponse.appendHeader("Set-Cookie", sessionCookie("", 0));
    httpResponse.setStatusCode(HTTP_NO_CONTENT);
  }

  private String sessionCookie(String value, long maxAgeSeconds) {
    return String.format("gwc_session=%s; Domain=%s; Path=/; Max-Age=%d; HttpOnly; Secure; SameSite=Lax",
      value, cookieDomain(), maxAgeSeconds);
  }

  private String cookieDomain() {
    var origin = frontendOrigin;
    var schemeEnd = origin.indexOf("://");
    var host = schemeEnd >= 0 ? origin.substring(schemeEnd + 3) : origin;
    // Leading dot keeps the cookie visible on both the apex (groovyconsole.dev)
    // and any subdomain (access.groovyconsole.dev). Modern browsers accept both
    // forms; the explicit dot makes the intent unambiguous.
    return "." + host;
  }

  private void handlePreflight(HttpRequest httpRequest, HttpResponse httpResponse) {
    addCorsHeaders(httpRequest, httpResponse);
    if (originAllowed(httpRequest)) {
      httpResponse.appendHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
      httpResponse.appendHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    httpResponse.setStatusCode(HTTP_NO_CONTENT);
  }

  private void addCorsHeaders(HttpRequest httpRequest, HttpResponse httpResponse) {
    if (originAllowed(httpRequest)) {
      httpResponse.appendHeader("Access-Control-Allow-Origin", frontendOrigin);
      httpResponse.appendHeader("Access-Control-Allow-Credentials", "true");
    }
    httpResponse.appendHeader("Vary", "Origin");
  }

  private Optional<String> firstHeader(Map<String, List<String>> headers, String name) {
    var values = headers.get(name);
    if (values == null || values.isEmpty()) return Optional.empty();
    return Optional.ofNullable(values.get(0));
  }

  private void handleAuthResponse(HttpRequest httpRequest, HttpResponse httpResponse) throws Exception {
    var parameters = httpRequest.getQueryParameters();
    var code = getFirstHeaderValue(parameters, "code");
    var state = getFirstHeaderValue(parameters, "state");
    var headers = httpRequest.getHeaders();

    var stateCookie = parseCookieForStateParam(headers);
    if (stateCookie.isEmpty() || !stateCookie.get().equals(state)) {
      throw new UnauthorizedException();
    }

    var accessTokenResponse = exchangeCodeForAccessToken(code);
    if (!accessTokenResponse.getScope().contains("gist")) {
      httpResponse.setStatusCode(HTTP_FORBIDDEN);
      httpResponse.setContentType("text/plain");
      var writer = httpResponse.getWriter();
      writer.write("This application requires the gist scope.");
      return;
    }

    var jwe = sessionCodec.encrypt(accessTokenResponse);
    httpResponse.appendHeader("Set-Cookie", sessionCookie(jwe, SESSION_MAX_AGE_SECONDS));
    httpResponse.setStatusCode(HTTP_OK);
    httpResponse.setContentType("text/html");
    try (var writer = httpResponse.getWriter()) {
      writer.write(loginCompleteHtml());
    }
  }

  private static final long SESSION_MAX_AGE_SECONDS = 60L * 60L * 24L * 30L; // 30 days

  private String loginCompleteHtml() {
    return "<!doctype html><script>"
      + "window.opener?.postMessage({type:'gwc:login-success'},'" + frontendOrigin + "');"
      + "window.close();"
      + "</script>";
  }

  private void handleAuthRequest(HttpResponse httpResponse) {
    var state = UUID.randomUUID().toString();
    httpResponse.setStatusCode(HTTP_MOVED_TEMP);
    var authRequestParams = Map.of(
      "client_id", clientId,
      "redirect_uri", redirectUri,
      "scope", "gist",
      "state", state
    );
    httpResponse.appendHeader("Location", GITHUB_AUTHORIZE + "?" + urlEncodeParams(authRequestParams));
    // 10 minutes is plenty for a user to complete GitHub's OAuth dance; the cookie should not
    // outlive that. Same HttpOnly/Secure/SameSite=Lax stance as gwc_session so a compromised
    // page on the function's origin can neither read nor cross-site-write this CSRF token.
    httpResponse.appendHeader("Set-Cookie",
      "state=" + state + "; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax");
  }

  private void handleErrorResponse(HttpResponse httpResponse, Map<String, List<String>> parameters) throws IOException {
    httpResponse.setContentType("text/plain");
    var writer = httpResponse.getWriter();
    writer.write("Error: " + getFirstHeaderValue(parameters, "error"));
    writer.newLine();
    writer.write("Description: " + getFirstHeaderValue(parameters, "error_description"));
    httpResponse.setStatusCode(HTTP_FORBIDDEN);
  }

  private String getFirstHeaderValue(Map<String, List<String>> parameters, String error) {
    return requireNonNull(parameters.get(error).get(0));
  }

  private Optional<String> parseCookieForStateParam(Map<String, List<String>> headers) {
    // java.net.HttpCookie doesn't support parsing Cookie headers, only Set-Cookie headers
    var cookies = headers.get("Cookie");
    if (cookies == null) return Optional.empty();
    return cookies.stream()
      .map(COOKIE_PATTERN::matcher)
      .filter(Matcher::find)
      .map(matcher -> matcher.group(1))
      .findFirst();
  }

  private TokenResponse exchangeCodeForAccessToken(String code) throws IOException, InterruptedException, UnauthorizedException {
    String tokenRequestBody = urlEncodeParams(Map.of("client_id", clientId, "client_secret", clientSecret, "code", code));

    var tokenRequest = newBuilder().uri(tokenExchangeUrl)
      .POST(java.net.http.HttpRequest.BodyPublishers.ofString(tokenRequestBody))
      .header("Accept", "application/json")
      .header("Content-Type", "application/x-www-form-urlencoded")
      .build();
    var tokenResponse = client.send(tokenRequest, ofString());

    if (tokenResponse.statusCode() != HTTP_OK) {
      throw new UnauthorizedException();
    }

    return GSON.fromJson(tokenResponse.body(), TokenResponse.class);
  }

  private String urlEncodeParams(Map<String, String> map) {
    return map
      .entrySet()
      .stream()
      .map(entry -> join("=",
        encode(entry.getKey(), UTF_8),
        encode(entry.getValue(), UTF_8))
      ).collect(joining("&"));
  }
}
