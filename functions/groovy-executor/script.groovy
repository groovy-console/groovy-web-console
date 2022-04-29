@Grab('org.apache.commons:commons-math3:3.6.1')
import org.apache.commons.math3.primes.Primes
println Primes.isPrime(17)

// println 'hi'
// println System.getProperty("prop = ${System.getProperty('prop')}")
//println new File('/tmp/grapes').exists()
//new File('/tmp/grapes').listFiles().each { println it }

/*
@Grab('org.apache.commons:commons-math3:3.6.1')\nimport org.apache.commons.math3.primes.Primes\nprintln Primes.isPrime(17)
*/

// println Class.forName(\"groovy.grape.GrapeIvy\").declaredConstructor.newInstance()


/*

grape.root                          /tmp/grapes
groovy.grape.report.downloads       true
JAVA_TOOL_OPTIONS                   -Dgroovy.grape.report.downloads=true -Dgrape.root=/tmp/grapes

*/

/*

import com.sun.net.httpserver.HttpServer

HttpServer.create(new InetSocketAddress("localhost", 8001), 0).start()


- url: /(.*\.html)$
  static_files: static/\1
  upload: static/.*\.html$

*/
