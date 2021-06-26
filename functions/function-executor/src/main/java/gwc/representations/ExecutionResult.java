package gwc.representations;

public class ExecutionResult {
  private String out;
  private String err;
  private Object result;

  public ExecutionResult() {
  }

  public ExecutionResult(String out, String err, Object result) {
    this.out = out;
    this.err = err;
    this.result = result;
  }

  public String getOut() {
    return out;
  }

  public void setOut(String out) {
    this.out = out;
  }

  public String getErr() {
    return err;
  }

  public void setErr(String err) {
    this.err = err;
  }

  public Object getResult() {
    return result;
  }

  public void setResult(Object result) {
    this.result = result;
  }
}
