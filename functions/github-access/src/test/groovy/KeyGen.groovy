import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

class KeyGen {
  static void main(String[] args) {
    println generateKey();
  }

  static String generateKey() {
    KeyGenerator keyGen = KeyGenerator.getInstance("AES");
    keyGen.init(128);
    SecretKey key = keyGen.generateKey()
    return Base64.urlEncoder.withoutPadding().encodeToString(key.getEncoded());
  }
}
