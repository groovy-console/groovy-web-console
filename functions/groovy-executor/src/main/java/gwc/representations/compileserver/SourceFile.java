package gwc.representations.compileserver;

public class SourceFile {
    public String name;
    public String text;

  public SourceFile() {
  }

  public SourceFile(String name, String text) {
    this.name = name;
    this.text = text;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getText() {
    return text;
  }

  public void setText(String text) {
    this.text = text;
  }
}
