package gwc.spock;

import gwc.spi.SpecSupport;
import org.spockframework.util.SpockReleaseInfo;

/**
 * Spock-backed {@link SpecSupport} provider, registered via {@code ServiceLoader}.
 * Only present on the Spock-supporting build variants (Groovy 3/4/5).
 */
public class SpockSpecSupport implements SpecSupport {

  @Override
  public Object runSpec(String code) {
    ScriptRunner scriptRunner = new ScriptRunner();
    // TODO revisit colored output
    scriptRunner.setDisableColors(true);
    return scriptRunner.run(code);
  }

  @Override
  public String renderAst(String code, String phase, boolean isSpock) {
    return new AstRenderer().render(code, phase, isSpock);
  }

  @Override
  public String spockVersion() {
    return SpockReleaseInfo.getVersion().toString();
  }
}
