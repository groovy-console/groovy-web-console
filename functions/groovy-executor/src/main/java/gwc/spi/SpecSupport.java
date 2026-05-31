package gwc.spi;

/**
 * Optional support for executing Spock specifications and rendering their AST.
 *
 * <p>The implementation is Spock-dependent and is only compiled into the
 * Spock-supporting build variants (Groovy 3/4/5). On variants without Spock
 * (e.g. Groovy 6) no provider is registered and {@link java.util.ServiceLoader}
 * resolution yields no result, in which case the executor reports that the
 * feature is not supported on the running Groovy version.
 */
public interface SpecSupport {

  /**
   * Compiles and runs the given script as one or more Spock specifications.
   *
   * @param code the script source
   * @return the rendered specification result tree
   */
  Object runSpec(String code);

  /**
   * @return the Spock version available on this build, for reporting in execution info
   */
  String spockVersion();

  /**
   * Renders the AST of the given script at the requested compile phase.
   *
   * @param code    the script source
   * @param phase   the compile phase name (case-insensitive)
   * @param isSpock whether the script is a Spock specification
   * @return the transpiled source
   */
  String renderAst(String code, String phase, boolean isSpock);
}
