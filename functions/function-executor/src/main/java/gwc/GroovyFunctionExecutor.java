package gwc;

import java.io.IOException;

import com.google.cloud.functions.*;
import java.util.stream.Collectors;
import java.io.*;
import java.util.*;
import java.util.logging.*;
import groovy.lang.*;
import org.codehaus.groovy.control.MultipleCompilationErrorsException;

public class GroovyFunctionExecutor implements HttpFunction {
    private final static Logger LOGGER = Logger.getLogger(GroovyFunctionExecutor.class.getName());

    public GroovyFunctionExecutor() {
        LOGGER.info("Initialization");
        File grapeDir = new File("/tmp/grapes");
        if (!grapeDir.exists()) {
            LOGGER.info("Creating Grapes directory");
            grapeDir.mkdirs();
        }
    }

    public void service(HttpRequest request, HttpResponse response) throws IOException {
        LOGGER.info("Start");
        
        LOGGER.info("Grapes root env var: " + System.getenv("grape.root"));
        LOGGER.info("Grapes root sys prop: " + System.getProperty("grape.root"));
        LOGGER.info("Groovy version: " + GroovySystem.getVersion());
        LOGGER.info("JAVA_TOOL_OPTIONS: " + System.getenv("JAVA_TOOL_OPTIONS"));
        
        String inputScriptOrClass = request.getReader().lines()
            .collect(Collectors.joining(System.lineSeparator()));

        System.out.println(inputScriptOrClass);

        ByteArrayOutputStream stream = new ByteArrayOutputStream();
        PrintStream outPrintStream = new PrintStream(stream, true, "UTF-8");
        // Binding binding = new Binding();
        Binding binding = new Binding(Map.of("out", outPrintStream));
        GroovyShell shell = new GroovyShell(binding);

        PrintStream originalOut = System.out;
        PrintStream originalErr = System.err;
        try {
            System.setOut(outPrintStream);
            System.setErr(outPrintStream);
            LOGGER.info("Evaluation of");
            LOGGER.info(inputScriptOrClass);
            Object result = shell.evaluate(inputScriptOrClass);
            LOGGER.info("Result: " + (result != null ? result.toString() : "null"));
            outPrintStream.flush();
        } catch (MultipleCompilationErrorsException e) {
            LOGGER.log(Level.SEVERE, "Compilation error: " + e.getMessage(), e);
            e.printStackTrace(new PrintWriter(outPrintStream));
        } catch (Throwable t) {
            LOGGER.log(Level.SEVERE, "Other error: " + t.getMessage(), t);
            t.printStackTrace(new PrintWriter(outPrintStream));
        } finally {
            LOGGER.info("Finally");
            System.setOut(originalOut);
            System.setErr(originalErr);            
        }

        String output = stream.toString("UTF-8");
        LOGGER.info("Output: " + output);
        response.getWriter().write(output);
        
        LOGGER.info("End");
    }
}