/*
 * Copyright 2009 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package gwc.spock;

import spock.lang.Specification;

import java.util.List;

import groovy.lang.GroovyClassLoader;
import org.codehaus.groovy.control.*;
import org.codehaus.groovy.control.customizers.ImportCustomizer;
import org.codehaus.groovy.control.io.StringReaderSource;

// cannot use GCL as-is because we need a StringReaderSource
// only reason why we inherit from GCL is that ClassCollector has protected constructor
@SuppressWarnings({"unchecked", "rawtypes"})
public class ScriptCompiler extends GroovyClassLoader {
  public List<Class> compile(String scriptText) throws CompilationFailedException {
    CompilerConfiguration compilerConfiguration = new CompilerConfiguration();
    ImportCustomizer importCustomizer = new ImportCustomizer();
    importCustomizer.addStarImports(Specification.class.getPackageName());
    compilerConfiguration.addCompilationCustomizers(importCustomizer);

    CompilationUnit unit = new CompilationUnit(compilerConfiguration, null, this);
    SourceUnit su = new SourceUnit("Script1.groovy", new StringReaderSource(scriptText, unit.getConfiguration()),
      unit.getConfiguration(), unit.getClassLoader(), unit.getErrorCollector());
    unit.addSource(su);

    ClassCollector collector = createCollector(unit, su);
    unit.setClassgenCallback(collector);
    unit.compile(Phases.CLASS_GENERATION);
    return (List)collector.getLoadedClasses();
  }
}
