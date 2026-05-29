package gwc

import com.google.cloud.functions.HttpRequest
import com.google.cloud.functions.HttpResponse
import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.junit.jupiter.api.Test

import static org.junit.jupiter.api.Assertions.assertEquals
import static org.junit.jupiter.api.Assertions.assertNull
import static org.junit.jupiter.api.Assertions.assertTrue

/**
 * Exercises {@link GFunctionExecutor} on a build WITHOUT Spock (the Groovy 6 variant).
 * Plain Groovy must run normally; Spock specs and the AST view must report that they
 * are not supported instead of failing obscurely.
 */
class GFunctionExecutorFallbackTest {

  private final GFunctionExecutor executor = new GFunctionExecutor()

  private Map invoke(Map payload) {
    def reader = new BufferedReader(new StringReader(JsonOutput.toJson(payload)))
    def output = new StringWriter()
    def writer = new BufferedWriter(output)
    def request = [
      getMethod     : { 'POST' },
      getContentType: { Optional.of('application/json') },
      getReader     : { reader },
    ] as HttpRequest
    def response = [
      appendHeader  : { String name, String value -> },
      setContentType: { String contentType -> },
      setStatusCode : { int code -> },
      getWriter     : { writer },
    ] as HttpResponse

    // The executor writes the response and closes the writer (try-with-resources),
    // which flushes it into `output`.
    executor.service(request, response)
    new JsonSlurper().parseText(output.toString()) as Map
  }

  @Test
  void 'plain Groovy script returns its result'() {
    def response = invoke(code: '1 + 1')
    assertEquals(2, response.result)
    assertEquals('', response.err)
  }

  @Test
  void 'plain Groovy script output is captured'() {
    def response = invoke(code: "print 'Hello World'")
    assertEquals('Hello World', response.out)
    assertEquals('', response.err)
  }

  @Test
  void 'Spock specification reports not supported'() {
    def response = invoke(code: '''
class ASpec extends Specification {
  def "hello world"() {
    expect: true
  }
}
''')
    assertTrue(
      response.err.contains('Spock specifications are not supported'),
      "unexpected err: ${response.err}")
    assertNull(response.result)
  }

  @Test
  void 'AST action reports not supported'() {
    def response = invoke(code: 'def x = 1', action: 'ast', astPhase: 'CONVERSION')
    assertTrue(
      response.err.contains('The AST view is not supported'),
      "unexpected err: ${response.err}")
    assertNull(response.result)
  }
}
