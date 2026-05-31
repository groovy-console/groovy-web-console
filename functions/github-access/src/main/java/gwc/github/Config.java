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
  String frontendOrigin,
  String tokenExchangeUrl,
  String githubApiBaseUrl
) {
  public static final String DEFAULT_TOKEN_EXCHANGE_URL = "https://github.com/login/oauth/access_token";
  public static final String DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";

  public Config(String clientId, String clientSecret, String redirectUri, SecretKey secretKey, String frontendOrigin) {
    this(clientId, clientSecret, redirectUri, secretKey, frontendOrigin, DEFAULT_TOKEN_EXCHANGE_URL, DEFAULT_GITHUB_API_BASE_URL);
  }

  public static Config fromEnv() {
    return new Config(
      requireNonNull(System.getenv("GITHUB_CLIENT_ID"), "GITHUB_CLIENT_ID is not set"),
      requireNonNull(System.getenv("GITHUB_CLIENT_SECRET"), "GITHUB_CLIENT_SECRET is not set"),
      requireNonNull(System.getenv("GITHUB_REDIRECT_URI"), "GITHUB_REDIRECT_URI is not set"),
      parseSecretKey(requireNonNull(System.getenv("SECRET_KEY"), "SECRET_KEY is not set")),
      requireNonNull(System.getenv("FRONTEND_ORIGIN"), "FRONTEND_ORIGIN is not set")
    );
  }

  static SecretKey parseSecretKey(String secretKey) {
    byte[] decoded = Base64.getUrlDecoder().decode(secretKey);
    if (decoded.length != 16) {
      throw new IllegalArgumentException(
        "SECRET_KEY must decode to 16 bytes for AES-128 (got " + decoded.length + " bytes). "
          + "Regenerate via functions/github-access/src/test/groovy/KeyGen.groovy.");
    }
    return new SecretKeySpec(decoded, "AES");
  }
}
