package gwc.util;

import java.util.*;

import groovy.lang.*;

public class MetaClassRegistryGuard implements AutoCloseable {
  private final List<MetaClassRegistryChangeEvent> emcEvents = new ArrayList<>();
  private final MetaClassRegistryChangeEventListener listener = emcEvents::add;

  public MetaClassRegistryGuard() {
    GroovySystem.getMetaClassRegistry().addMetaClassRegistryChangeEventListener(listener);
  }

  @Override
  public void close() {
    GroovySystem.getMetaClassRegistry().removeMetaClassRegistryChangeEventListener(listener);
    emcEvents.stream()
      .map(MetaClassRegistryChangeEvent::getClassToUpdate)
      .forEach(GroovySystem.getMetaClassRegistry()::removeMetaClass);
  }
}
