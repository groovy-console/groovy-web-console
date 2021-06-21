package gwc

import spock.lang.Specification
import spock.lang.Subject

import com.google.cloud.functions.HttpRequest
import com.google.cloud.functions.HttpResponse
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

class GFunctionExecutorTest extends Specification {

  @Subject
  GFunctionExecutor executor = new GFunctionExecutor()

  HttpRequest httpRequest = Stub()
  HttpResponse httpResponse = Mock()

  def "can execute ordinary script"() {
    given:
    httpRequest.method >> "POST"
    httpRequest.reader >> createReader([code: "print 'Hello World'"])
    def output = new StringWriter()

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.appendHeader('Access-Control-Allow-Origin', '*')
    1 * httpResponse.setContentType('application/json')
    1 * httpResponse.getWriter() >> new BufferedWriter(output)

    and:
    def response = new JsonSlurper().parseText(output.toString())
    response.out == 'Hello World'
    response.err == ''
    response.result == null
  }

  def "can execute Spock Specification script"() {
    given:
    httpRequest.method >> "POST"
    httpRequest.reader >> createReader([code: '''
class ASpec extends Specification {
  def "hello world"() {
    expect: true
  }
}
'''])
    def output = new StringWriter()

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.appendHeader('Access-Control-Allow-Origin', '*')
    1 * httpResponse.setContentType('application/json')
    1 * httpResponse.getWriter() >> new BufferedWriter(output)

    and:
    def response = new JsonSlurper().parseText(output.toString())
    response.out == ''
    response.err == ''
    response.result.normalize() == '''\
╷
└─ Spock ✔
   └─ ASpec ✔
      └─ hello world ✔
'''
  }

  BufferedReader createReader(Map input) {
    new BufferedReader(new StringReader(JsonOutput.toJson(input)))
  }
}
