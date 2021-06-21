package gwc

import com.google.cloud.functions.*
import java.util.logging.*
import org.codehaus.groovy.control.MultipleCompilationErrorsException
import org.codehaus.groovy.control.messages.*
import groovy.json.*
import groovy.util.logging.*

@Log
class GFunctionExecutor implements HttpFunction {
    

    GFunctionExecutor() {
        log.info('Groovy function executor initialized')
    }

    void service(HttpRequest request, HttpResponse response) {
        response.appendHeader('Access-Control-Allow-Origin', '*')
        
        if (request.getMethod() == 'OPTIONS') {
            response.appendHeader('Access-Control-Allow-Methods', 'POST')
            response.appendHeader('Access-Control-Allow-Headers', 'Content-Type')
            response.appendHeader('Access-Control-Max-Age', '3600')
        } else {
            def inputScriptOrClass = new JsonSlurper().parse(request.reader).code
            log.info("Input code:\n---\n${inputScriptOrClass}\n---\n")

            // Setup a metaclass registry listener
            def emcEvents = []
            def listener = { MetaClassRegistryChangeEvent event ->
                emcEvents << event
            } as MetaClassRegistryChangeEventListener
            GroovySystem.metaClassRegistry.addMetaClassRegistryChangeEventListener(listener)

            def outStream = new ByteArrayOutputStream()
            def outPrintStream = new PrintStream(outStream, true, 'UTF-8')
            def errorOutput = new StringBuilder()

            def binding = new Binding([out: outPrintStream])
            def shell = new GroovyShell(binding)

            def originalOut = System.out
            System.setOut(outPrintStream)
            def result = null
            try {
                result = shell.evaluate(inputScriptOrClass)
            } catch (MultipleCompilationErrorsException e) {
                e.errorCollector.errors.each { err ->
                    switch (err) {
                        case SimpleMessage: 
                            errorOutput << err.message
                            break
                        case ExceptionMessage: 
                            errorOutput << err.cause.message
                            break
                        case SyntaxErrorMessage: 
                            errorOutput << err.cause.message
                            break
                    }
                }
            } catch (Throwable t) {
                sanitizeStacktrace(t)
                def errorWriter = new StringWriter()
                t.printStackTrace(new PrintWriter(errorWriter))
                errorOutput << errorWriter.toString()
            } finally {
                outPrintStream.flush()
                System.setOut(originalOut)

                // Restore metaclass registry
                GroovySystem.metaClassRegistry.removeMetaClassRegistryChangeEventListener(listener)
                emcEvents.each { MetaClassRegistryChangeEvent event ->
                    GroovySystem.metaClassRegistry.removeMetaClass event.clazz
                }
            }

            def outOutput = outStream.toString('UTF-8')

            log.info("Output:\n---\n${outOutput}\n---\n")
            log.info("Result:\n---\n${result}\n---\n")
            log.info("Error:\n---\n${errorOutput}\n---\n")

            response.contentType = 'application/json'
            response.writer << JsonOutput.toJson(
                out: outOutput,
                err: errorOutput,
                result: result
            )
        }
    }

    private sanitizeStacktrace(t) {
        def filtered = [
                'com.google.cloud.', 'org.eclipse.jetty.',
                'java.', 'javax.', 'sun.', 'jdk.',
                'groovy', 'org.codehaus.groovy.', 'org.apache.groovy',
                'gwc.'
        ]
        def trace = t.stackTrace
        def newTrace = []
        trace.each { stackTraceElement ->
            if (filtered.every { !stackTraceElement.className.startsWith(it) }) {
                newTrace << stackTraceElement
            }
        }
        def clean = newTrace.toArray(newTrace as StackTraceElement[])
        t.stackTrace = clean
    }
}