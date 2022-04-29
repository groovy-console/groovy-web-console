package gwc.util;

import java.io.*;
import java.nio.charset.StandardCharsets;

public class OutputRedirector implements AutoCloseable {
  private final PrintStream originalOut = System.out;
  private final PrintStream originalErr = System.err;
  private final ByteArrayOutputStream outStream = new ByteArrayOutputStream();
  private final PrintStream outPrintStream = new PrintStream(outStream, true, StandardCharsets.UTF_8);

  public OutputRedirector redirect() {
    System.setOut(outPrintStream);
    System.setErr(outPrintStream);
    return this;
  }

  @Override
  public void close() {
    outPrintStream.flush();
    System.setOut(originalOut);
    System.setErr(originalErr);
  }

  public PrintStream getOutPrintStream() {
    return outPrintStream;
  }

  public String getOutput() {
    return outStream.toString(StandardCharsets.UTF_8);
  }
}
