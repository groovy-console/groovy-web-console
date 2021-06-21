package gwc.remote;

import java.net.URI;

public interface RemoteSource {
  default boolean supports(URI source) {
    return supports(source.getScheme());
  }
  boolean supports(String scheme);

  String loadSource(URI source);
}
