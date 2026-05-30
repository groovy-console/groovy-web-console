package gwc.github

import spock.lang.Specification

import java.util.Base64

class ConfigTest extends Specification {

  def "parseSecretKey accepts a 16-byte (AES-128) key"() {
    given:
    def encoded = Base64.urlEncoder.withoutPadding().encodeToString(new byte[16])

    when:
    def key = Config.parseSecretKey(encoded)

    then:
    key.algorithm == "AES"
    key.encoded.length == 16
  }

  def "parseSecretKey rejects keys that don't decode to 16 bytes"() {
    given:
    def encoded = Base64.urlEncoder.withoutPadding().encodeToString(new byte[badLength])

    when:
    Config.parseSecretKey(encoded)

    then:
    def e = thrown(IllegalArgumentException)
    e.message.contains("16 bytes")
    e.message.contains("$badLength byte")

    where:
    badLength << [8, 24, 32, 0]
  }
}
