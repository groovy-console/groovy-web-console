package gwc;

import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.logging.Logger;
import java.util.regex.Pattern;

import com.google.cloud.functions.*;
import com.google.gson.Gson;
import groovy.lang.*;
import groovy.util.logging.Log;
import gwc.representations.*;
import gwc.spock.ScriptRunner;
import org.codehaus.groovy.control.MultipleCompilationErrorsException;
import org.codehaus.groovy.control.messages.*;

@Log
public class GFunctionExecutor implements HttpFunction {
  private static final Logger LOG = Logger.getLogger(GroovyFunctionExecutor.class.getName());

  private static final Pattern SPOCK_SCRIPT = Pattern.compile("extends\\s+(?:spock\\.lang\\.)?Specification");
  private static final List<String> FILTER_STACKTRACE = List.of(
    "com.google.cloud.", "org.eclipse.jetty.",
    "java.", "javax.", "sun.", "jdk.",
    "groovy", "org.codehaus.groovy.", "org.apache.groovy",
    "gwc.");
  private static final Gson GSON = new Gson();


  public GFunctionExecutor() {
    LOG.info("Groovy function executor initialized");
  }

  @Override
  public void service(HttpRequest request, HttpResponse response) throws Exception {
    response.appendHeader("Access-Control-Allow-Origin", "*");

    if ("OPTIONS".equals(request.getMethod())) {
      response.appendHeader("Access-Control-Allow-Methods", "POST");
      response.appendHeader("Access-Control-Allow-Headers", "Content-Type");
      response.appendHeader("Access-Control-Max-Age", "3600");
    } else {
      ScriptRequest scriptRequest = GSON.fromJson(request.getReader(), ScriptRequest.class);
      String inputScriptOrClass = scriptRequest.getCode();
      LOG.info("Input code:\n---\n${inputScriptOrClass}\n---\n");

      // Setup a metaclass registry listener
      var emcEvents = new ArrayList<MetaClassRegistryChangeEvent>();
      MetaClassRegistryChangeEventListener listener = emcEvents::add;
      GroovySystem.getMetaClassRegistry().addMetaClassRegistryChangeEventListener(listener);

      var outStream = new ByteArrayOutputStream();
      var outPrintStream = new PrintStream(outStream, true, StandardCharsets.UTF_8);
      var errorOutput = new StringBuilder();

      var originalOut = System.out;
      System.setOut(outPrintStream);
      Object result = null;
      ExecutionInfo stats = new ExecutionInfo();
      try {
        long executionStart = System.currentTimeMillis();
        if (SPOCK_SCRIPT.matcher(inputScriptOrClass).find()) {
          if(new BigDecimal(GroovySystem.getShortVersion()).compareTo(new BigDecimal("4.0"))>= 0) {
            // disable groovy version check in Spock for groovy 4.0 or greater
            System.setProperty("spock.iKnowWhatImDoing.disableGroovyVersionCheck", "true");
          } else {
            System.clearProperty("spock.iKnowWhatImDoing.disableGroovyVersionCheck");
          }
          ScriptRunner scriptRunner = new ScriptRunner();
          // TODO revisit colored output
          scriptRunner.setDisableColors(true);
          result = scriptRunner.run(inputScriptOrClass);
        } else {
          var binding = new Binding();
          binding.setVariable("out", outPrintStream);
          var shell = new GroovyShell(binding);
          result = shell.evaluate(inputScriptOrClass);
        }
        stats.setExecutionTime(System.currentTimeMillis() - executionStart);
      } catch (MultipleCompilationErrorsException e) {
        e.getErrorCollector().getErrors().forEach(err -> {
          if (err instanceof SimpleMessage) {
            errorOutput.append(((SimpleMessage)err).getMessage());
          } else if (err instanceof ExceptionMessage) {
            errorOutput.append(((ExceptionMessage)err).getCause().getMessage());
          } else if (err instanceof SyntaxErrorMessage) {
            errorOutput.append(((SyntaxErrorMessage)err).getCause().getMessage());
          }
        });
      } catch (Throwable t) {
        sanitizeStacktrace(t);
        var errorWriter = new StringWriter();
        t.printStackTrace(new PrintWriter(errorWriter));
        errorOutput.append(errorWriter);
      } finally {
        outPrintStream.flush();
        System.setOut(originalOut);

        // Restore metaclass registry
        GroovySystem.getMetaClassRegistry().removeMetaClassRegistryChangeEventListener(listener);
        emcEvents.forEach((MetaClassRegistryChangeEvent event) -> GroovySystem.getMetaClassRegistry().removeMetaClass(event.getClass()));
      }

      var outOutput = outStream.toString(StandardCharsets.UTF_8);

      LOG.info("Output:\n---\n${outOutput}\n---\n");
      LOG.info("Result:\n---\n${result}\n---\n");
      LOG.info("Error:\n---\n${errorOutput}\n---\n");

      response.setContentType("application/json");

      try (Writer writer = response.getWriter()) {
        String responseContent = GSON.toJson(new ExecutionResult(outOutput, errorOutput.toString(), result, stats));
        writer.write(responseContent);
      }
    }
  }

  private void sanitizeStacktrace(Throwable t) {
    var clean = Arrays.stream(t.getStackTrace())
      .filter(stackTraceElement -> FILTER_STACKTRACE.stream()
        .noneMatch(it -> stackTraceElement.getClassName().startsWith(it)))
      .toArray(StackTraceElement[]::new);
    t.setStackTrace(clean);
  }
}
