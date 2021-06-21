package gwc.remote;

public class RemoteSourceException extends RuntimeException {
  public RemoteSourceException(String message, Throwable cause) {
    super(message, cause);
  }

  public RemoteSourceException(Throwable cause) {
    super(cause);
  }

  public RemoteSourceException(String message) {
    super(message);
  }
}
