package gwc.representations.compileserver;

import java.util.ArrayList;
import java.util.List;

public class TestRequest {
  private List<SourceFile> files = new ArrayList<>();

  public List<SourceFile> getFiles() {
    return files;
  }

  public void setFiles(List<SourceFile> files) {
    this.files = files;
  }
}
