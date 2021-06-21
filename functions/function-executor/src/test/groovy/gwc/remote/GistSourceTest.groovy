package gwc.remote

import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig

import spock.lang.*

import java.net.http.HttpClient

import com.github.tomakehurst.wiremock.WireMockServer
import static com.github.tomakehurst.wiremock.client.WireMock.*;


class GistSourceTest extends Specification {

  @AutoCleanup("stop")
  @Shared
  WireMockServer wireMockServer = new WireMockServer().tap {
    start()
  }

  @Shared
  HttpClient httpClient = HttpClient.newHttpClient()

  @Subject
  GistSource gistSource = new GistSource(httpClient, URI.create("http://localhost:${wireMockServer.options.portNumber()}"))

  def setup() {
    wireMockServer.resetAll()
  }

  def "supports gist: sources"() {
    expect:
    gistSource.supports("gist")
  }

  def "can download remote gist source"(){
    given:
    stubFor(get("/gists/58f61cf36e112ff654041eeec8d11a98")
        .willReturn(aResponse().withBodyFile('gist-api/get-gist-58f61cf36e112ff654041eeec8d11a98.json')))
    when:
    // https://gist.github.com/leonard84/58f61cf36e112ff654041eeec8d11a98
    def result = gistSource.loadSource(URI.create("gist:/58f61cf36e112ff654041eeec8d11a98"))

    then:
    result == '''\
import spock.lang.*

class ASpec extends Specification {
  def "hello world"() {
    expect: true
  }
}
'''
  }
}
