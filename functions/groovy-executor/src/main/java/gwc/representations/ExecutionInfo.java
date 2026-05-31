package gwc.representations;

import groovy.lang.GroovySystem;

public class ExecutionInfo {
  private long executionTime = -1;
  private String groovyVersion = GroovySystem.getVersion();

  // Populated by the executor from the Spock provider; "n/a" when Spock is absent
  // (e.g. the Groovy 6 build), since spock-core is not on the classpath here.
  private String spockVersion = "n/a";

  private String javaVersion = System.getProperty("java.version");

  public long getExecutionTime() {
    return executionTime;
  }

  public void setExecutionTime(long executionTime) {
    this.executionTime = executionTime;
  }

  public String getGroovyVersion() {
    return groovyVersion;
  }

  public void setGroovyVersion(String groovyVersion) {
    this.groovyVersion = groovyVersion;
  }

  public String getSpockVersion() {
    return spockVersion;
  }

  public void setSpockVersion(String spockVersion) {
    this.spockVersion = spockVersion;
  }

  public String getJavaVersion() {
    return javaVersion;
  }

  public void setJavaVersion(String javaVersion) {
    this.javaVersion = javaVersion;
  }
}
