package gwc.representations;

public class ScriptRequest {
  private String code;
  private String action = "run";
  private String astPhase;

  public String getCode() {
    return code;
  }

  public void setCode(String code) {
    this.code = code;
  }

  public String getAction() {
    return action;
  }

  public void setAction(String action) {
    this.action = action;
  }

  public String getAstPhase() {
    return astPhase;
  }

  public void setAstPhase(String astPhase) {
    this.astPhase = astPhase;
  }
}
