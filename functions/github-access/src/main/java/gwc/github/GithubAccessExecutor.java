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
      httpResponse.setStatusCode(HTTP_FORBIDDEN);
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
    if (httpRequest.getMethod().equals("POST") && action.equals("logout")) {
      handleLogout(httpResponse);
    }
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
    return schemeEnd >= 0 ? origin.substring(schemeEnd + 3) : origin;
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
    httpResponse.appendHeader("Set-Cookie", "state=" + state);
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
    return headers.get("Cookie").stream()
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
