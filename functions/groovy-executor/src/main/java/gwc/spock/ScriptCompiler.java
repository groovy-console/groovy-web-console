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

import groovy.lang.GroovyClassLoader;
import gwc.representations.compileserver.SourceFile;
import org.codehaus.groovy.control.*;
import org.codehaus.groovy.control.customizers.ImportCustomizer;
import org.codehaus.groovy.control.io.StringReaderSource;
import spock.lang.Specification;

import java.util.List;

// cannot use GCL as-is because we need a StringReaderSource
// only reason why we inherit from GCL is that ClassCollector has protected constructor
@SuppressWarnings({"unchecked", "rawtypes"})
public class ScriptCompiler extends GroovyClassLoader {
  public List<Class> compile(List<SourceFile> files) throws CompilationFailedException {
    CompilerConfiguration compilerConfiguration = new CompilerConfiguration();
    ImportCustomizer importCustomizer = new ImportCustomizer();
    importCustomizer.addStarImports(Specification.class.getPackageName());
    compilerConfiguration.addCompilationCustomizers(importCustomizer);

    CompilationUnit unit = new CompilationUnit(compilerConfiguration, null, this);
    files.stream()
      .map(sourceFile -> new SourceUnit(
        sourceFile.getName(),
        new StringReaderSource(sourceFile.getText(), unit.getConfiguration()),
        unit.getConfiguration(),
        unit.getClassLoader(),
        unit.getErrorCollector()))
      .forEach(unit::addSource);

    ClassCollector collector = createCollector(unit, null);
    unit.setClassgenCallback(collector);
    unit.compile(Phases.CLASS_GENERATION);
    return (List) collector.getLoadedClasses();
  }
}
