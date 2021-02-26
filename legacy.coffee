import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { StreamLanguage } from '@codemirror/stream-parser'
import { brainfuck} from "@codemirror/legacy-modes/mode/brainfuck"
import { commonLisp } from "@codemirror/legacy-modes/mode/commonlisp"
import { erlang } from "@codemirror/legacy-modes/mode/erlang"
import { go } from "@codemirror/legacy-modes/mode/go"
import { haskell } from "@codemirror/legacy-modes/mode/haskell"
import { pascal } from "@codemirror/legacy-modes/mode/pascal"
import { perl } from "@codemirror/legacy-modes/mode/perl"
import { ruby } from "@codemirror/legacy-modes/mode/ruby"
import { shell } from "@codemirror/legacy-modes/mode/shell"
import { swift } from "@codemirror/legacy-modes/mode/swift"

languages =
	"text/javascript": javascript
	"text/x-brainfuck": => StreamLanguage.define brainfuck
	"text/x-c++src": cpp
	"text/x-common-lisp": => StreamLanguage.define commonLisp
	# "text/x-csharp": 
	# "text/x-csrc": 
	"text/x-erlang": => StreamLanguage.define erlang 
	"text/x-go": => StreamLanguage.define go
	"text/x-haskell": => StreamLanguage.define haskell 
	"text/x-java": java
	# "text/x-kotlin": 
	"text/x-pascal": => StreamLanguage.define pascal
	"text/x-perl": => StreamLanguage.define perl
	# "text/x-php": 
	"text/x-python": python
	"text/x-ruby": => StreamLanguage.define ruby
	"text/x-sh": => StreamLanguage.define shell
	"text/x-swift": => StreamLanguage.define swift

export default { languages }