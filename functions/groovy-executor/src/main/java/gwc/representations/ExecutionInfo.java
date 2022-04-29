package gwc.representations;

import groovy.lang.GroovySystem;
import org.spockframework.util.SpockReleaseInfo;

public class ExecutionInfo {
  private long executionTime = -1;
  private String groovyVersion = GroovySystem.getVersion();

  private String spockVersion = SpockReleaseInfo.getVersion().toString();

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
}
