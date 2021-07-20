package gwc.util;

import java.util.*;

public class SystemPropertiesGuard implements AutoCloseable {
  private final Properties initialSystemProperties = new Properties();

  public SystemPropertiesGuard() {
      this.initialSystemProperties.putAll(System.getProperties());
  }

  @Override
  public void close() {
      System.setProperties(initialSystemProperties);
  }
}
