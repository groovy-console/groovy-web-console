package gwc.github;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

import static java.util.Objects.requireNonNull;

public record Config(
  String clientId,
  String clientSecret,
  String redirectUri,
  SecretKey secretKey,
  String frontendOrigin
) {
  public static Config fromEnv() {
    return new Config(
      requireNonNull(System.getenv("GITHUB_CLIENT_ID"), "GITHUB_CLIENT_ID is not set"),
      requireNonNull(System.getenv("GITHUB_CLIENT_SECRET"), "GITHUB_CLIENT_SECRET is not set"),
      requireNonNull(System.getenv("GITHUB_REDIRECT_URI"), "GITHUB_REDIRECT_URI is not set"),
      parseSecretKey(requireNonNull(System.getenv("SECRET_KEY"), "SECRET_KEY is not set")),
      requireNonNull(System.getenv("FRONTEND_ORIGIN"), "FRONTEND_ORIGIN is not set")
    );
  }

  private static SecretKey parseSecretKey(String secretKey) {
    return new SecretKeySpec(Base64.getUrlDecoder().decode(secretKey), "AES");
  }
}
