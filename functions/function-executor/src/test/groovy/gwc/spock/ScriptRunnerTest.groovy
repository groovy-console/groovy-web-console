package gwc.spock

import spock.lang.Specification

class ScriptRunnerTest extends Specification {

  def scriptRunner = new ScriptRunner()

  def setup() {
    scriptRunner.disableColors = true
  }

  def "will return notice when no test class is found"() {
    when:
    def result = scriptRunner.run("")
    then:
    result == 'No runnable specifications found'
  }

  def "will execute simple testcase"() {
    when:
    def result = scriptRunner.run ('''
class ASpec extends Specification {
  def "hello world"() {
    expect: true
  }
}
''').normalize()
    then:
    result == '''\
╷
└─ Spock ✔
   └─ ASpec ✔
      └─ hello world ✔
'''
  }

  def "will execute simple testcase with condition not satisfied"() {
    when:
    def result = scriptRunner.run ('''
class ASpec extends Specification {
  def "hello world"() {
    expect:
    1 + 1 == 3
  }
}
''').normalize()
    then:
    result == '''\
╷
└─ Spock ✔
   └─ ASpec ✔
      └─ hello world ✘ Condition not satisfied:
            
               1 + 1 == 3
                 |   |
                 2   false
'''
  }


  def "will execute complex testcase with condition not satisfied"() {
    when:
    def result = scriptRunner.run ('''
class ASpec extends Specification {
  def "simple math"() {
    expect:
    1 + 1 == 3
  }
  
  def "maximum"() {
    expect:
    Math.max(a, b) == c
    
    where:
    a | b | c
    1 | 2 | 2
    3 | 4 | 3
    6 | 9 | 9
    4 | 2 | 4
  }
  
    def "maximum of #a and #b is #c"() {
    expect:
    Math.max(a, b) == c
    
    where:
    a | b | c
    1 | 2 | 2
    3 | 4 | 3
    6 | 9 | 9
    4 | 2 | 4
  }
}
''').normalize()
    then:
    result == '''\
╷
└─ Spock ✔
   └─ ASpec ✔
      ├─ simple math ✘ Condition not satisfied:
      │     
      │        1 + 1 == 3
      │          |   |
      │          2   false
      ├─ maximum ✔
      │  ├─ maximum [a: 1, b: 2, c: 2, #0] ✔
      │  ├─ maximum [a: 3, b: 4, c: 3, #1] ✘ Condition not satisfied:
      │  │     
      │  │        Math.max(a, b) == c
      │  │        |    |   |  |  |  |
      │  │        |    4   3  4  |  3
      │  │        |              false
      │  │        class java.lang.Math
      │  ├─ maximum [a: 6, b: 9, c: 9, #2] ✔
      │  └─ maximum [a: 4, b: 2, c: 4, #3] ✔
      └─ maximum of #a and #b is #c ✔
         ├─ maximum of 1 and 2 is 2 ✔
         ├─ maximum of 3 and 4 is 3 ✘ Condition not satisfied:
         │     
         │        Math.max(a, b) == c
         │        |    |   |  |  |  |
         │        |    4   3  4  |  3
         │        |              false
         │        class java.lang.Math
         ├─ maximum of 6 and 9 is 9 ✔
         └─ maximum of 4 and 2 is 4 ✔
'''
  }
}
