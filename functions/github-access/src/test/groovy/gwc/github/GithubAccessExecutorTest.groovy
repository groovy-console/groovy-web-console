package gwc.github

import com.github.tomakehurst.wiremock.WireMockServer
import com.google.cloud.functions.HttpRequest
import com.google.cloud.functions.HttpResponse
import spock.lang.AutoCleanup
import spock.lang.Specification
import spock.lang.Subject

import javax.crypto.spec.SecretKeySpec

import static com.github.tomakehurst.wiremock.client.WireMock.*
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig

class GithubAccessExecutorTest extends Specification {

  static final String FRONTEND = "https://groovyconsole.dev"
  static final byte[] KEY_BYTES = new byte[16] // all-zero key, fine for tests

  @AutoCleanup("stop")
  WireMockServer wiremock = new WireMockServer(wireMockConfig().dynamicPort())

  Config config

  @Subject
  GithubAccessExecutor executor

  HttpRequest httpRequest = Stub()
  HttpResponse httpResponse = Mock()

  def setup() {
    wiremock.start()
    config = new Config(
      "test-client-id",
      "test-client-secret",
      "https://access.groovyconsole.dev/",
      new SecretKeySpec(KEY_BYTES, "AES"),
      FRONTEND,
      "http://localhost:${wiremock.port()}/login/oauth/access_token",
      "http://localhost:${wiremock.port()}"
    )
    executor = new GithubAccessExecutor(config)
  }

  def "OPTIONS preflight from allowed origin returns 204 with CORS headers"() {
    given:
    httpRequest.method >> "OPTIONS"
    httpRequest.headers >> ["Origin": [FRONTEND]]

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.setStatusCode(204)
    1 * httpResponse.appendHeader("Access-Control-Allow-Origin", FRONTEND)
    1 * httpResponse.appendHeader("Access-Control-Allow-Credentials", "true")
    1 * httpResponse.appendHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
    1 * httpResponse.appendHeader("Access-Control-Allow-Headers", "Content-Type")
    1 * httpResponse.appendHeader("Vary", "Origin")
  }

  def "POST ?action=logout clears the session cookie and returns 204"() {
    given:
    httpRequest.method >> "POST"
    httpRequest.headers >> ["Origin": [FRONTEND]]
    httpRequest.queryParameters >> ["action": ["logout"]]

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.setStatusCode(204)
    1 * httpResponse.appendHeader("Set-Cookie", { String it ->
      it.startsWith("gwc_session=;") &&
        it.contains("Domain=groovyconsole.dev") &&
        it.contains("HttpOnly") &&
        it.contains("Secure") &&
        it.contains("SameSite=Lax") &&
        it.contains("Path=/") &&
        it.contains("Max-Age=0")
    })
    1 * httpResponse.appendHeader("Access-Control-Allow-Origin", FRONTEND)
    1 * httpResponse.appendHeader("Access-Control-Allow-Credentials", "true")
  }

  def "POST ?action=logout without matching Origin is rejected"() {
    given:
    httpRequest.method >> "POST"
    httpRequest.headers >> ["Origin": ["https://evil.example.com"]]
    httpRequest.queryParameters >> ["action": ["logout"]]

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.setStatusCode(403)
    0 * httpResponse.appendHeader("Set-Cookie", _)
  }

  def "OAuth callback sets gwc_session cookie and returns inline postMessage HTML"() {
    given:
    def state = "11111111-2222-3333-4444-555555555555"
    wiremock.stubFor(post(urlEqualTo("/login/oauth/access_token"))
      .willReturn(okJson('{"access_token":"ghs_test_token","scope":"gist","token_type":"bearer"}')))
    httpRequest.method >> "GET"
    httpRequest.queryParameters >> ["code": ["the-code"], "state": [state]]
    httpRequest.headers >> ["Cookie": ["state=${state}".toString()]]
    def output = new StringWriter()

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.setStatusCode(200)
    1 * httpResponse.setContentType("text/html")
    _ * httpResponse.getWriter() >> new BufferedWriter(output)
    1 * httpResponse.appendHeader("Set-Cookie", { String it ->
      it.startsWith("gwc_session=") &&
        !it.startsWith("gwc_session=;") &&
        it.contains("Domain=groovyconsole.dev") &&
        it.contains("HttpOnly") &&
        it.contains("Secure") &&
        it.contains("SameSite=Lax") &&
        it.contains("Path=/")
    })

    and:
    def body = output.toString()
    body.contains("postMessage")
    body.contains("gwc:login-success")
    body.contains(FRONTEND)
    body.contains("window.close()")
  }

  def "OAuth callback rejects state cookie mismatch"() {
    given:
    httpRequest.method >> "GET"
    httpRequest.queryParameters >> ["code": ["the-code"], "state": ["11111111-2222-3333-4444-555555555555"]]
    httpRequest.headers >> ["Cookie": ["state=99999999-8888-7777-6666-555555555555"]]

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.setStatusCode(403)
    0 * httpResponse.appendHeader("Set-Cookie", { String it -> it.startsWith("gwc_session=") && !it.startsWith("gwc_session=;") })
  }

  def "OAuth callback without gist scope returns 403"() {
    given:
    def state = "11111111-2222-3333-4444-555555555555"
    wiremock.stubFor(post(urlEqualTo("/login/oauth/access_token"))
      .willReturn(okJson('{"access_token":"ghs_test_token","scope":"","token_type":"bearer"}')))
    httpRequest.method >> "GET"
    httpRequest.queryParameters >> ["code": ["the-code"], "state": [state]]
    httpRequest.headers >> ["Cookie": ["state=${state}".toString()]]
    def output = new StringWriter()

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.setStatusCode(403)
    0 * httpResponse.appendHeader("Set-Cookie", { String it -> it.startsWith("gwc_session=") && !it.startsWith("gwc_session=;") })
    _ * httpResponse.getWriter() >> new BufferedWriter(output)
  }

  def "GET ?action=me without session cookie returns 401"() {
    given:
    httpRequest.method >> "GET"
    httpRequest.queryParameters >> ["action": ["me"]]
    httpRequest.headers >> ["Origin": [FRONTEND]]

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.setStatusCode(401)
  }

  def "GET ?action=me with malformed session cookie returns 401"() {
    given:
    httpRequest.method >> "GET"
    httpRequest.queryParameters >> ["action": ["me"]]
    httpRequest.headers >> [
      "Origin": [FRONTEND],
      "Cookie": ["gwc_session=not-a-real-jwe"]
    ]

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.setStatusCode(401)
  }

  def "GET ?action=me returns login and avatar from GitHub"() {
    given:
    def jwe = new SessionTokenCodec(config.secretKey()).encrypt(token("ghs_test", "gist"))
    wiremock.stubFor(get(urlEqualTo("/user"))
      .withHeader("Authorization", equalTo("Bearer ghs_test"))
      .willReturn(okJson('{"login":"alice","avatar_url":"https://avatars/alice.png","name":"Alice"}')))
    httpRequest.method >> "GET"
    httpRequest.queryParameters >> ["action": ["me"]]
    httpRequest.headers >> [
      "Origin": [FRONTEND],
      "Cookie": ["gwc_session=${jwe}".toString()]
    ]
    def output = new StringWriter()

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.setStatusCode(200)
    1 * httpResponse.setContentType("application/json")
    _ * httpResponse.getWriter() >> new BufferedWriter(output)

    and:
    def body = new groovy.json.JsonSlurper().parseText(output.toString())
    body.login == "alice"
    body.avatar_url == "https://avatars/alice.png"
    body.size() == 2 // no extra fields leaked
  }

  def "GET ?action=me returns 401 if GitHub rejects the token"() {
    given:
    def jwe = new SessionTokenCodec(config.secretKey()).encrypt(token("ghs_revoked", "gist"))
    wiremock.stubFor(get(urlEqualTo("/user"))
      .willReturn(status(401)))
    httpRequest.method >> "GET"
    httpRequest.queryParameters >> ["action": ["me"]]
    httpRequest.headers >> [
      "Origin": [FRONTEND],
      "Cookie": ["gwc_session=${jwe}".toString()]
    ]

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.setStatusCode(401)
  }

  private TokenResponse token(String accessToken, String scope) {
    new TokenResponse(access_token: accessToken, scope: scope, token_type: "bearer")
  }

  def "OPTIONS preflight from disallowed origin omits Allow-Origin"() {
    given:
    httpRequest.method >> "OPTIONS"
    httpRequest.headers >> ["Origin": ["https://evil.example.com"]]

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.setStatusCode(204)
    1 * httpResponse.appendHeader("Vary", "Origin")
    0 * httpResponse.appendHeader("Access-Control-Allow-Origin", _)
    0 * httpResponse.appendHeader("Access-Control-Allow-Credentials", _)
    0 * httpResponse.appendHeader("Access-Control-Allow-Methods", _)
    0 * httpResponse.appendHeader("Access-Control-Allow-Headers", _)
  }
}
