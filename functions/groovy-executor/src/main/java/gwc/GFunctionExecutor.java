package gwc;

import com.google.cloud.functions.HttpFunction;
import com.google.cloud.functions.HttpRequest;
import com.google.cloud.functions.HttpResponse;
import groovy.util.logging.Log;
import gwc.representations.ExecutionInfo;
import gwc.representations.ExecutionResult;
import gwc.util.MetaClassRegistryGuard;
import gwc.util.OutputRedirector;
import gwc.util.SystemPropertiesGuard;
import org.codehaus.groovy.control.MultipleCompilationErrorsException;
import org.codehaus.groovy.control.messages.ExceptionMessage;
import org.codehaus.groovy.control.messages.SimpleMessage;
import org.codehaus.groovy.control.messages.SyntaxErrorMessage;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.io.Writer;
import java.util.Arrays;
import java.util.List;
import java.util.logging.Logger;

import static gwc.Util.GSON;

@Log
public class GFunctionExecutor implements HttpFunction {
  private static final Logger LOG = Logger.getLogger(GFunctionExecutor.class.getName());
  private static final List<String> FILTER_STACKTRACE = List.of(
    "com.google.cloud.", "org.eclipse.jetty.",
    "java.", "javax.", "sun.", "jdk.",
    "groovy", "org.codehaus.groovy.", "org.apache.groovy",
    "gwc.");


  public GFunctionExecutor() {
    LOG.info("Groovy function executor initialized");
  }

  @Override
  public void service(HttpRequest request, HttpResponse response) throws Exception {
    response.appendHeader("Access-Control-Allow-Origin", "*");

    if ("OPTIONS".equals(request.getMethod())) {
      handlePreFlightRequest(response);
    } else if ("POST".equals(request.getMethod())) {
      if (!"application/json".equalsIgnoreCase((request.getContentType().orElse("")))) {
        response.setStatusCode(406);
      } else if (request.getPath().startsWith("/api/compiler/")) {
        CompilerServerApi.handleCompileRequest(request, response);
      } else {
        handleRealInvocation(request, response);
      }
    } else {
      response.setStatusCode(204);
    }
  }

  private void handlePreFlightRequest(HttpResponse response) {
    response.appendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    response.appendHeader("Access-Control-Allow-Headers", "Content-Type");
    response.appendHeader("Access-Control-Max-Age", "3600");
  }

  private void handleRealInvocation(HttpRequest request, HttpResponse response) throws IOException {

    var errorOutput = new StringBuilder();

    OutputRedirector outputRedirector = new OutputRedirector();
    Object result = null;
    ExecutionInfo stats = new ExecutionInfo();
    try (var ignore = new MetaClassRegistryGuard();
         var ignore2 = outputRedirector.redirect();
         var igonre3 = new SystemPropertiesGuard()) {
      long executionStart = System.currentTimeMillis();
      if (request.getPath().startsWith("/api/compiler/")) {
        CompilerServerApi.handleCompileRequest(request, response);
      } else {
        result = GroovyExecutor.handleRequest(request, outputRedirector);
      }
      stats.setExecutionTime(System.currentTimeMillis() - executionStart);
    } catch (MultipleCompilationErrorsException e) {
      handleCompilationErrors(errorOutput, e);
    } catch (Throwable t) {
      throwableToErrorOutput(errorOutput, t);
    }

    String outOutput = outputRedirector.getOutput();
    LOG.info("Output:\n---\n" + outOutput + "\n---\n");
    LOG.info("Result:\n---\n" + result + "\n---\n");
    LOG.info("Error:\n---\n" + errorOutput + "}\n---\n");

    response.setContentType("application/json");

    ExecutionResult executionResult = new ExecutionResult(
      outOutput,
      errorOutput.toString(),
      result,
      stats);
    try (Writer writer = response.getWriter()) {
      String responseContent;
      try {
        responseContent = GSON.toJson(executionResult);
      } catch (Exception e) { // serialization of result may fail, so catch the exception
        errorOutput.append("\nFailed to serialize result: ").append(e.getMessage());
        executionResult.setErr(errorOutput.toString());
        executionResult.setResult(null);
        responseContent = GSON.toJson(executionResult);
      } catch (StackOverflowError e) { // serialization of result may fail, so catch the exception
        errorOutput.append("\nFailed to serialize result due to circular references.");
        executionResult.setErr(errorOutput.toString());
        executionResult.setResult(null);
        responseContent = GSON.toJson(executionResult);
      }
      writer.write(responseContent);
    }
  }

  private void handleCompilationErrors(StringBuilder errorOutput, MultipleCompilationErrorsException e) {
    e.getErrorCollector().getErrors().forEach(err -> {
      if (err instanceof SimpleMessage) {
        errorOutput.append(((SimpleMessage) err).getMessage());
      } else if (err instanceof ExceptionMessage) {
        errorOutput.append(((ExceptionMessage) err).getCause().getMessage());
      } else if (err instanceof SyntaxErrorMessage) {
        errorOutput.append(((SyntaxErrorMessage) err).getCause().getMessage());
      }
    });
  }

  private void throwableToErrorOutput(StringBuilder errorOutput, Throwable t) {
    sanitizeStacktrace(t);
    var errorWriter = new StringWriter();
    t.printStackTrace(new PrintWriter(errorWriter));
    errorOutput.append(errorWriter);
  }

  private void sanitizeStacktrace(Throwable t) {
    var clean = Arrays.stream(t.getStackTrace())
      .filter(stackTraceElement -> FILTER_STACKTRACE.stream()
        .noneMatch(it -> stackTraceElement.getClassName().startsWith(it)))
      .toArray(StackTraceElement[]::new);
    t.setStackTrace(clean);
  }
}
