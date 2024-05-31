package gwc

import org.spockframework.util.*
import spock.lang.*

import com.google.cloud.functions.*
import groovy.json.*

class GFunctionExecutorTest extends Specification {
  @Shared
  String outErrorPrefix = SpockReleaseInfo.isCompatibleGroovyVersion(VersionNumber.parse(GroovySystem.version)) ? "" :
    "Executing Spock ${SpockReleaseInfo.version} with NOT compatible Groovy version ${GroovySystem.version} due to set spock.iKnowWhatImDoing.disableGroovyVersionCheck system property. This is unsupported and may result in weird runtime errors!\n"

  @Subject
  GFunctionExecutor executor = new GFunctionExecutor()

  HttpRequest httpRequest = Stub()
  HttpResponse httpResponse = Mock()

  def "can execute ordinary script"() {
    given:
    httpRequest.method >> "POST"
    httpRequest.contentType >> Optional.of("application/json")
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
    response.out.normalize() == outErrorPrefix + 'Hello World'
    response.err == ''
    response.result == null
  }

  def "can execute Spock Specification script"() {
    given:
    httpRequest.method >> "POST"
    httpRequest.contentType >> Optional.of("application/json")
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
    response.out.normalize() == outErrorPrefix
    response.err == ''
    response.result.normalize() == '''\
╷
└─ Spock ✔
   └─ ASpec ✔
      └─ hello world ✔
'''
  }

  def "can return objects"() {
    given:
    httpRequest.method >> "POST"
    httpRequest.contentType >> Optional.of("application/json")
    httpRequest.reader >> createReader([code: '[a: 1, b: "hello", c: [d: 42]]'])
    def output = new StringWriter()

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.appendHeader('Access-Control-Allow-Origin', '*')
    1 * httpResponse.setContentType('application/json')
    1 * httpResponse.getWriter() >> new BufferedWriter(output)

    and:
    def response = new JsonSlurper().parseText(output.toString())
    response.out.normalize() == outErrorPrefix
    response.err == ''
    response.result == [a: 1, b: "hello", c: [d: 42]]
  }

  def "can deal with serialization errors"() {
    given:
    httpRequest.method >> "POST"
    httpRequest.contentType >> Optional.of("application/json")
    httpRequest.reader >> createReader([code: "GroovySystem"])
    def output = new StringWriter()

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.appendHeader('Access-Control-Allow-Origin', '*')
    1 * httpResponse.setContentType('application/json')
    1 * httpResponse.getWriter() >> new BufferedWriter(output)

    and:
    def response = new JsonSlurper().parseText(output.toString())
    response.out.normalize() == outErrorPrefix
    response.err == '\nFailed to serialize result: Attempted to serialize java.lang.Class: groovy.lang.GroovySystem. Forgot to register a type adapter?\nSee https://github.com/google/gson/blob/main/Troubleshooting.md#java-lang-class-unsupported'
    response.result == null
  }

  def "ensure system properties are not affected by scripts"() {
    given:
    httpRequest.method >> "POST"
    httpRequest.contentType >> Optional.of("application/json")
    httpRequest.reader >> createReader([code: "System.setProperty('foo', 'bar')"])
    def output = new StringWriter()
    def originalSysProps = new Properties();
    originalSysProps.putAll(System.getProperties());

    when:
    executor.service(httpRequest, httpResponse)

    then:
    1 * httpResponse.appendHeader('Access-Control-Allow-Origin', '*')
    1 * httpResponse.setContentType('application/json')
    1 * httpResponse.getWriter() >> new BufferedWriter(output)

    and:
    !System.getProperties().containsKey('foo')
  }

  BufferedReader createReader(Map input) {
    new BufferedReader(new StringReader(JsonOutput.toJson(input)))
  }
}
