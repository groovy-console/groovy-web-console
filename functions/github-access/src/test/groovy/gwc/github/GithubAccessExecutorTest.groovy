package gwc.github

import com.google.cloud.functions.HttpRequest
import com.google.cloud.functions.HttpResponse
import spock.lang.Specification
import spock.lang.Subject

import javax.crypto.spec.SecretKeySpec

class GithubAccessExecutorTest extends Specification {

  static final String FRONTEND = "https://groovyconsole.dev"
  static final byte[] KEY_BYTES = new byte[16] // all-zero key, fine for tests

  Config config = new Config(
    "test-client-id",
    "test-client-secret",
    "https://access.groovyconsole.dev/",
    new SecretKeySpec(KEY_BYTES, "AES"),
    FRONTEND
  )

  @Subject
  GithubAccessExecutor executor = new GithubAccessExecutor(config)

  HttpRequest httpRequest = Stub()
  HttpResponse httpResponse = Mock()

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
