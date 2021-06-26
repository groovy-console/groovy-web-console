package gwc.representations;

import groovy.lang.GroovySystem;

public class ExecutionInfo {
  private long executionTime = -1;
  private String groovyVersion = GroovySystem.getVersion();

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
}
