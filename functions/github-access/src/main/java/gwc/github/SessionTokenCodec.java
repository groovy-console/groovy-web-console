package gwc.github;

import com.google.gson.Gson;
import com.nimbusds.jose.EncryptionMethod;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWEAlgorithm;
import com.nimbusds.jose.JWEHeader;
import com.nimbusds.jose.JWEObject;
import com.nimbusds.jose.Payload;
import com.nimbusds.jose.crypto.DirectDecrypter;
import com.nimbusds.jose.crypto.DirectEncrypter;

import javax.crypto.SecretKey;
import java.text.ParseException;

/**
 * Encrypts and decrypts the OAuth token payload as a JWE blob suitable for storage in a cookie.
 * Never log the input token or the output blob.
 */
class SessionTokenCodec {
  private static final Gson GSON = new Gson();
  private final SecretKey secretKey;

  SessionTokenCodec(SecretKey secretKey) {
    this.secretKey = secretKey;
  }

  String encrypt(TokenResponse token) throws JOSEException {
    JWEHeader header = new JWEHeader(JWEAlgorithm.DIR, EncryptionMethod.A128GCM);
    JWEObject jwe = new JWEObject(header, new Payload(GSON.toJson(token)));
    jwe.encrypt(new DirectEncrypter(secretKey));
    return jwe.serialize();
  }

  TokenResponse decrypt(String jwe) throws JOSEException, ParseException {
    JWEObject parsed = JWEObject.parse(jwe);
    parsed.decrypt(new DirectDecrypter(secretKey));
    return GSON.fromJson(parsed.getPayload().toString(), TokenResponse.class);
  }
}
