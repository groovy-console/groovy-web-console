package gwc.github;

import com.google.cloud.functions.HttpFunction;
import com.google.cloud.functions.HttpRequest;
import com.google.cloud.functions.HttpResponse;
import com.google.gson.Gson;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.DirectDecrypter;
import com.nimbusds.jose.crypto.DirectEncrypter;
import com.nimbusds.jose.crypto.RSAEncrypter;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.text.ParseException;
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
  private static final URI GITHUB_ACCESS_TOKEN_URL = URI.create("https://github.com/login/oauth/access_token");
  private static final String GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";

  private final String clientId = requireNonNull(System.getenv("GITHUB_CLIENT_ID"), "GITHUB_CLIENT_ID is not set");
  private final String clientSecret = requireNonNull(System.getenv("GITHUB_CLIENT_SECRET"), "GITHUB_CLIENT_SECRET is not set");
  private final String redirectUri = requireNonNull(System.getenv("GITHUB_REDIRECT_URI"), "GITHUB_REDIRECT_URI is not set");

  // Generate with KeyGen in src/test/groovy
  private final SecretKey secretKey = parseSecretKey(requireNonNull(System.getenv("SECRET_KEY"), "SECRET_KEY is not set"));

  private SecretKey parseSecretKey(String secret_key) {
    return new SecretKeySpec(Base64.getUrlDecoder().decode(secret_key), "AES");
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
    if (httpRequest.getMethod().equals("GET")) {
      var parameters = httpRequest.getQueryParameters();

      if (parameters.containsKey("error")) {
        handleErrorResponse(httpResponse, parameters);
      } else if (parameters.containsKey("action") && getFirstHeaderValue(parameters, "action").equals("login")) {
        handleAuthRequest(httpResponse);
      } else if (parameters.containsKey("code") && parameters.containsKey("state")) {
        handleAuthResponse(httpRequest, httpResponse);
      }
    }
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
    } else {
      httpResponse.setStatusCode(HTTP_OK);
      var writer = httpResponse.getWriter();
      httpResponse.setContentType("text/plain");
      if (redirectUri.startsWith("http://localhost")) {
        writer.write(GSON.toJson(accessTokenResponse));
        writer.newLine();
      }
      writer.write(encryptToken(accessTokenResponse));
    }
  }

  private String encryptToken(TokenResponse accessTokenResponse) throws JOSEException {
    JWEHeader header = new JWEHeader(JWEAlgorithm.DIR, EncryptionMethod.A128GCM);
    JWEObject jwe = new JWEObject(
      header,
      new Payload(GSON.toJson(accessTokenResponse)));
    jwe.encrypt(new DirectEncrypter(secretKey));
    return jwe.serialize();
  }

  private TokenResponse decryptToken(String token) throws JOSEException, ParseException {
    JWEObject jwe = JWEObject.parse(token);
    jwe.decrypt(new DirectDecrypter(secretKey));
    return GSON.fromJson(jwe.getPayload().toString(), TokenResponse.class);
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

    var tokenRequest = newBuilder().uri(GITHUB_ACCESS_TOKEN_URL)
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
