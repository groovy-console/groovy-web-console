package gwc.representations.compileserver;

import java.util.ArrayList;
import java.util.List;

public class RunRequest {
  private List<String> args = new ArrayList<>();
  private List<SourceFile> files = new ArrayList<>();

  public List<String> getArgs() {
    return args;
  }

  public List<SourceFile> getFiles() {
    return files;
  }
}
