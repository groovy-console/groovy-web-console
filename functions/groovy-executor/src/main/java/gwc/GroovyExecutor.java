package gwc;

import com.google.cloud.functions.HttpRequest;
import groovy.lang.Binding;
import groovy.lang.GroovyShell;
import gwc.representations.ScriptRequest;
import gwc.spock.AstRenderer;
import gwc.spock.ScriptRunner;
import gwc.util.OutputRedirector;

import java.util.logging.Logger;
import java.util.regex.Pattern;

import static gwc.Util.GSON;

public class GroovyExecutor {
  private static final Logger LOG = Logger.getLogger(GroovyExecutor.class.getName());

  private static final Pattern SPOCK_SCRIPT = Pattern.compile("extends\\s+(?:spock\\.lang\\.)?Specification");

  public static Object handleRequest(HttpRequest request, OutputRedirector outputRedirector) throws Exception {
    Object result;
    ScriptRequest scriptRequest = GSON.fromJson(request.getReader(), ScriptRequest.class);
    String inputScriptOrClass = scriptRequest.getCode();
    LOG.info("Input code:\n---\n" + inputScriptOrClass + "\n---\n");
    boolean isSpock = SPOCK_SCRIPT.matcher(inputScriptOrClass).find();
    if ("ast".equalsIgnoreCase(scriptRequest.getAction())) {
      result = transpileScript(inputScriptOrClass, scriptRequest.getAstPhase(), isSpock);
    } else {
      if (isSpock) {
        result = executeSpock(inputScriptOrClass);
      } else {
        result = executeGroovyScript(inputScriptOrClass, outputRedirector);
      }
    }
    return result;
  }

  private static Object executeGroovyScript(String inputScriptOrClass, OutputRedirector outputRedirector) {
    var binding = new Binding();
    binding.setVariable("out", outputRedirector.getOutPrintStream());
    var shell = new GroovyShell(binding);
    return shell.evaluate(inputScriptOrClass);
  }

  private static Object executeSpock(String inputScriptOrClass) {
    ScriptRunner scriptRunner = new ScriptRunner();
    // TODO revisit colored output
    scriptRunner.setDisableColors(true);
    return scriptRunner.run(inputScriptOrClass);
  }

  private static String transpileScript(String script, String astPhase, boolean isSpock) {
    return new AstRenderer().render(script, astPhase, isSpock);
  }

}
