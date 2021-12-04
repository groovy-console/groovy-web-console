package gwc.spock;

import spock.util.*;

import java.util.*;

import org.codehaus.groovy.control.CompilePhase;

public class AstRenderer {
  public String render(String script, String compilePhase, boolean isSpock) {
    CompilePhase phase = parseCompilePhase(compilePhase);
    TranspileResult transpileResult = isSpock ?
      embeddedSpecCompiler.transpileWithImports(script, EnumSet.allOf(Show.class), phase) :
      embeddedSpecCompiler.transpile(script, EnumSet.allOf(Show.class), phase);
    return transpileResult.getSource();
  }

  private static CompilePhase parseCompilePhase(String compilePhase) {
    try {
      return CompilePhase.valueOf(compilePhase.toUpperCase(Locale.ROOT));
    } catch (RuntimeException e) {
      return CompilePhase.FINALIZATION;
    }

  }

  private final EmbeddedSpecCompiler embeddedSpecCompiler = new EmbeddedSpecCompiler();
}
