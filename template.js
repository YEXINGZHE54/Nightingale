	/* data structures
		point {
			start,
			end,
			type //whether a template expression
		}
		
		node {
			flag, //flag, pointing to handler
			spec, //specialized data
			next, //jump to next
			type, //whether a context or a end
		},
		null node : { '', {}, %d, end }
		const node: { '', point, %d, false }
		value node: { 'value', {value}, %d, false }
		loop node : { 'loop', {parent, child, key}, %d, context }
		
		handler {			
			flag, //a flag of the expr, better not started with ' '
			// @return node
			oncreate, //called when an expr node is created
			// @return {result,next}
			onrender, //called when a node is rendered
		}
		
		template {
			raw,  // raw string
			chain, // array of nodes
			handlers, //array of plugged handlers
			namespace, //namespace for variable
		}
	*/

	// @return template object
	function Template(raw_string){
		this.raw = raw_string;
		this.chain = [];
		this.conf = {
			startl	: '{',
			endl	: '}',
			contextstart	: 1,
			contextend		: 2,
			contextin		:0,
			/*
			nullNode  : { flag : 'endll', type : 0 },
			constNode : { flag : 'const', type : 1 },
			valueNode : { flag : 'value', type : 2 },
			loopNode  : { flag : 'loopl', type : 3 },			
			*/
		};
		this.handlers = {
			//default one, const handler
			const : {
				flag 		: 'const',
				oncreate	: function(point, index, tpl){ return new Node( 'const', point, index+1 ); },
				onrender	: function(node, tpl){ return {result : tpl.raw.slice(node.spec.start, node.spec.end) } }
			}
		};
		this.namespace = {}; //variable namespace
		this.context = []; //temp in compile time
		this.init();
	}
	
	// slice string
	function Point(start, end){
		this.start = start;
		this.end = end;
		this.type = arguments[2]?arguments[2]:false;
	}
	
	function Node(flag, spec, next){
		this.flag = flag;
		this.type = arguments[3]?arguments[3]:0;
		this.spec = spec;
		this.next = next;
	}
	
	Template.prototype.add_handler = function(handler){
		if(!handler.flag) return;
		var const_handler = this.handlers['const'];
		if(!handler.oncreate) handler.oncreate = const_handler.oncreate;
		if(!handler.onrender) handler.onrender = const_handler.onrender;
		this.handlers[handler.flag] = handler;
	}
	
	Template.prototype.add_handlers = function(handlers){
		var len = handlers.length;
		for(var i = 0; i < len; i++){
			this.add_handler(handlers[i]);
		}
	}

	// @return point[]
	Template.prototype.slice = function(raw_string){
		var conf = arguments[1]?arguments[1]:this.conf;
		var len = raw_string.length;
		var start = 0;
		var end = 0;
		var points = [];
		var node = {};
		while(end < len){
			start = raw_string.indexOf( conf.startl, end);
			if(start <0) {
				points.push(new Point(end, len, false));
				break;
			}
			// add a const point
			points.push(new Point(end, start, false));
			
			end = raw_string.indexOf( conf.endl, start);
			if(end <0) { //start already exits!
				console.log('missing endl for a startl');
				points.push(new Point(start, len, false));
				break;
			}
			// add a point
			end += 1;
			points.push(new Point(start + conf.startl.length, end - conf.endl.length, true));			
		}
		return points;
	}
	
	Template.prototype.trim = function(vstr){
		return vstr.replace(/^\s+/g,"").replace(/\s+$/g,"");
	}
	
	// extract variable into namespace of tpl, or fetch from namespace
	Template.prototype.extract = function(key){
		if( arguments.length == 2 ){ //insert
			var value = arguments[1];
			var old_value = null;
			if(this.namespace[key]) old_value = this.namespace[key];
			this.namespace[key] = value;
			return old_value;
		}else{
			if(!this.namespace[key]) return null; //if not exists			
			return this.namespace[key];
		}
	}
	
	//evaluate single expr value
	Template.prototype.evaluate	= function(expr){
					var intval = parseInt(expr);
					if(intval >= 0) return intval;
					var tpl = this;
					var temp = '';
					var keys = expr.split('.');
					var key = keys[0];
					var val = tpl.extract(key);
					if(!val) { //not in namespace
						if (eval("typeof(" + key + ")")=='undefined'){ //nor in global space
							console.log(key + ' is undefined value!');
							return null;
						}
					}else{
						eval( 'var ' + key + ' = ' + 'val;' ); //extract val to key
					}
					var eval_str = "var temp = " + expr + ";";
					try{
						eval(eval_str);
					}
					catch(e){
					
					}
					return temp;
	}
	
	//evaluate whole expressions
	Template.prototype.calc		= function(expr){
					var stack2 = this.Reverse_Polish_notation(expr);
					return this.Reverse_Polish_calc(stack2);
	}
	
	//install handlers
	Template.prototype.init = function(){
		var handlers = [
			{
				flag		: 'null', //also endl
				oncreate	: function(point, index, tpl){ return new Node('null', {}, index+1, tpl.conf.contextend); },
				onrender	: function(node, tpl){ return {}; }
			},
			{ //value handler
				flag		: 'v',
				oncreate	: function(point, index, tpl){ 
					var v = tpl.raw.slice(point.start, point.end);
					v = tpl.trim(v);
					return new Node('v', {value:v}, index+1);
				},
				onrender	: function(node, tpl){
					if(!node.spec.value) return {};
					var temp = tpl.evaluate(node.spec.value);
					return {result : temp};
				}
			},
			{
				flag		: 'lo',
				oncreate	: function(point, index, tpl){
					var sub_str = tpl.trim(tpl.raw.slice(point.start, point.end)); //skip startl and endl
					var vs = sub_str.split(" ");
					var len = vs.length;
					var p = '',c = '',k = '',state_c = '', state_k = '';
					for(var i=1; i < len; i++){
						if(!vs[i]) continue;
						if(!p) { p = vs[i]; continue; }
						if( vs[i].indexOf('=>') != -1 ) {state_c = true; continue;}
						if( vs[i].indexOf('=') != -1 ) {state_k = true; continue;}					
						if(state_c && !c) { c = vs[i]; break; }
						if(state_k && !k) { k = vs[i]; continue; }
					}
					return new Node('lo', { parent:p, child:c, key:k, loop_key:0, namespace:{} }, index+1, tpl.conf.contextstart);
				},
				onrender	: function(node, tpl, old_index){
					var var_p_ = tpl.extract(node.spec.parent);
					var old_parent = null;
					if ( !var_p_ ) { //not in tpl namespace
						if (eval("typeof(" + node.spec.parent + ")") == 'undefined'){ //nor in global space
							console.log('undefined!');
							this.cleanup(node, tpl);
							i = old_index+1; //jump to old index.next
							return { next : i}
						}
						var eval_str = "var var_p_ = " + node.spec.parent + ";";
						eval(eval_str); //now var_p_
						old_parent = tpl.extract(node.spec.parent, var_p_); //register it tpl namespace and save the old
					}
					if( !node.spec.namespace.hasOwnProperty(node.spec.parent) )
					node.spec.namespace[node.spec.parent] = old_parent;
					
					loop_len = var_p_.length;
					if(!node.loop_key) node.loop_key = 0;
					if(node.loop_key > loop_len-1){ //outof bounds
						this.cleanup(node, tpl);
						i = old_index+1; //jump to old index.next
						return { next : i}
					}
					var old_child = tpl.extract(node.spec.child, var_p_[node.loop_key]);
					if( !node.spec.namespace.hasOwnProperty(node.spec.child) )
						node.spec.namespace[node.spec.child] = old_child;
					
					if(node.spec.key){
						var old_key = tpl.extract(node.spec.key, node.loop_key+1);
						if( !node.spec.namespace.hasOwnProperty(node.spec.key) )
							node.spec.namespace[node.spec.key] = old_key;
					}
					node.loop_key += 1;
					return {};
				},
				cleanup		: function (node, tpl){
					if( node.spec.namespace.hasOwnProperty(node.spec.parent) ) tpl.extract( node.spec.parent, node.spec.namespace[node.spec.parent] );
					if( node.spec.namespace.hasOwnProperty(node.spec.child) ) tpl.extract( node.spec.child, node.spec.namespace[node.spec.child] );
					if( node.spec.namespace.hasOwnProperty(node.spec.key) ) tpl.extract( node.spec.key, node.spec.namespace[node.spec.key] );
					node.loop_key =0;
					node.spec.namespace = {};
				}
			},
			{
				flag : 'alias',
				oncreate	: function(point, index, tpl){
					var sub_str = tpl.trim(tpl.raw.slice(point.start+5, point.end)); //skip startl and endl
					var vs = sub_str.split("=");
					var len = vs.length;
					if( len != 2 ) return null;
					var old_v = tpl.trim(vs[1]);
					var new_v = tpl.trim(vs[0]);
					if( !old_v || !new_v ) return null;
					return new Node('alias', { old: old_v, new: new_v }, index+1);
				},
				onrender	: function(node, tpl){
					var old_v = node.spec.old;
					var new_v = node.spec.new;	
					var old = tpl.calc(old_v);
					tpl.extract(new_v, old);
					return {};
				}
			},
			{
				flag	: 'if',
				oncreate	: function(point, index, tpl){ 
					var v = tpl.raw.slice(point.start + 2, point.end);
					v = tpl.trim(v);
					return new Node('if', {value:v}, index+1, tpl.conf.contextstart);
				},
				onrender	: function(node, tpl, old_index){
					if(node.spec.visited) {
						node.spec.visited = null;
						return { next : old_index + 1};
					}
					node.spec.visited = 1;
					var expr_handler = tpl.handlers['expr'];
					result = expr_handler.calc(node.spec.value, tpl);
					if( !result ) {
						node.spec.visited = null;
						return { next : old_index + 1};
					}
					return {};
				}
			},
			{
				flag	: 'debug',
				oncreate	: function(point, index, tpl){ 
					var v = tpl.raw.slice(point.start + 5, point.end);
					v = tpl.trim(v);
					return new Node('debug', {value:v}, index+1);
				},
				onrender	: function(node, tpl){					
					result = tpl.calc(node.spec.value);
					console.log('debug: ' + node.spec.value + ' = ' + result);			
					return {};
				}
			},
			{
				flag	: 'expr',
				oncreate	: function(point, index, tpl){ 
					var v = tpl.raw.slice(point.start + 4, point.end);
					v = tpl.trim(v);
					return new Node('expr', {value:v}, index+1);
				},
				onrender	: function(node, tpl){
					var temp = tpl.calc(node.spec.value);
					return { result : temp };	
				}				
			},
			{
				flag	: 'while',
				oncreate	: function(point, index, tpl){ 
					var v = tpl.raw.slice(point.start + 5, point.end);
					v = tpl.trim(v);
					return new Node('while', {value:v, count : 0}, index+1, tpl.conf.contextstart);
				},
				onrender	: function(node, tpl, old_index){
					if(node.spec.count >= 100) return { next : old_index + 1}; //jump out of loop if too many counts
					node.spec.count += 1;
					result = tpl.calc(node.spec.value);
					if( !result ) {
						return { next : old_index + 1};
					}
					return {};
				}
			},
		];
		this.add_handlers(handlers);
	}
	
	// @return node
	Template.prototype.parse_slice = function(point, index){		
		if (!point.type){ //if not a template expression, be a const
			var const_handler = this.handlers['const'];
			return const_handler.oncreate(point, index, this);
			//return new Node(this.conf.constNode.type, point, index+1);
		}
		var node = {};
		var sub_str = this.raw.slice(point.start, point.end); //we have skipped the startl end endl
		var exprs = this.trim(sub_str).split(' ');
		//null empty node
		if( !exprs || exprs.length < 1 || !exprs[0] ) { 
			var null_handler = this.handlers['null'];
			return null_handler.oncreate(point, index, this);
		}

		var flag = this.trim(exprs[0]);
		var handler = this.handlers[flag];
		if( !handler ) handler = this.handlers['v'];
		node = handler.oncreate(point, index, this);		
		return node;
	}
	
	// @return void
	Template.prototype.chain_node = function(node){
		//if loop, so record a context environment
		if(node.type == this.conf.contextstart) this.context.push(node);
		//if null, means endof a context, so popup a context environment
		if(node.type == this.conf.contextend) {
			var ctx = this.context.pop();
			var origin = this.chain[ctx.next -2];
			origin.next = node.next -1;	//adjuct original one , point to the null					
			node.next = ctx.next -1;  //null jump to cxt starts				
		}
		this.chain.push(node);
	}
	
	// @return void ;compile string
	Template.prototype.compile = function(){
		if(arguments.length == 1) {
			this.raw = arguments[0];
		}
		this.chain = [];
		points = this.slice(this.raw, this.conf);
		var len = points.length;
		for(var i=0; i<len; i++){
			var point = points[i];
			var node = this.parse_slice(point, i);
			if(node) this.chain_node(node);
		}
	}
	
	// @return string result
	Template.prototype.render = function(data){
		if(data) this.namespace = data; //store namespace datas
		var len = this.chain.length;
		var node = {}, result = "", temp, old_index = 0, loop_key = 0, loop_len = 0;
		var i=0, loop_out = false;
		while(i < len){
			temp = {};
			node = this.chain[i];		
			var handler = this.handlers[node.flag];
			temp = handler.onrender(node, this, old_index);			
			if(temp.result) result += temp.result;
			old_index = i; //leave a print for trace back of loop out
			
			if(!temp.next) i = node.next; //default is false, unless it requires to jump
			else i = temp.next;
			//else loop_out = false; //not to update i, reset to false
		}
		this.cleanup();
		return result;
	}
	
	// @return string result
	Template.prototype.cleanup = function(){
		this.context = {};
		this.namespace = {};
	}
	
	
	/*
	* First of all, include a function to calculate expressions
	*/
Template.prototype.Reverse_Polish_notation = function( expr ){
	var stack1 = ['#'];
	var stack2 = [];
	var operators = {};
	
	operators['!'] = 6;
	
	operators['%']  = 5;
	operators['*']  = 5;
	operators['/']  = 5;
	operators['+']  = 4;
	operators['-']  = 4;
	
	operators['<<'] = 3;
	operators['>>'] = 3;
	
	operators['<']  = 2;
	operators['<='] = 2;
	operators['>']  = 2;
	operators['>='] = 2;
	operators['=='] = 2;
	operators['!='] = 2;
	
	operators['(']  = 1;
	operators['#']  = 0;
	
	var length = expr.length;
	var vname = "";
	var c, old_c;
	for(var index = 0; index < length; index++){
		c = expr.charAt(index);
		if ( c == '(' ) { if( vname ) stack2.push(vname);vname = ""; stack1.push(c);continue;}
		if ( c == ')' ) { if( vname ) stack2.push(vname);vname = ""; while( (old_c = stack1.pop()) != '(' ){ stack2.push(old_c); } continue; }
		cc = c + expr.charAt(index + 1);
		//checkfor double operators
		if ( operators[cc] ) { c = cc; index++; }
		
		if( operators[c] ) {			
			if( vname ) stack2.push(vname);
			vname = "";
			var degree = operators[c];
			old_c = stack1.pop();
			var o_degree = operators[old_c];
			while( degree <= o_degree ){
				stack2.push(old_c);
				old_c = stack1.pop();
				o_degree = operators[old_c];
			}
			stack1.push(old_c);
			stack1.push(c);
			continue;
		} else {
			switch(c){
				case ' ':
					if( vname ) stack2.push(vname);
					vname = "";
					break;
				default :
					vname += c;
					break;
			}
		}
	}
	//if vname not null
	if( vname ) stack2.push(vname);
	vname = "";
	//stack1 not empty
	if( stack1.length > 0 ) while( (old_c = stack1.pop()) != '#' ) { stack2.push(old_c); }
	return stack2.reverse();
}

/* eval_func, evaluate the value of an object */
Template.prototype.Reverse_Polish_calc = function( stack2 ) {
	var Ev = function(ev){
		this.ev = ev;
		var args = 2;
		if(arguments.length == 2) args = arguments[1];
		this.args = args;
	}
	var tpl = this;
	var evaluate = function(expr){
		var temp = tpl.evaluate(expr);
		return (parseInt(temp)>=0) ? parseInt(temp) : temp;
	}
	
	var stack1 = [];
	operators = {};
	operators['+'] = new Ev(function(arg1, arg2){ return arg1 + arg2; });
	operators['-'] = new Ev(function(arg1, arg2){ return arg1 - arg2; });
	operators['*'] = new Ev(function(arg1, arg2){ return arg1 * arg2; });
	operators['/'] = new Ev(function(arg1, arg2){ return arg1 / arg2; });
	operators['%'] = new Ev(function(arg1, arg2){ return arg1 % arg2; });
	operators['!'] = new Ev(function(arg1){ return (!arg1) ? 1 : 0; }, 1);
	operators['<<'] = new Ev(function(arg1, arg2){ return arg1 << arg2; });
	operators['>>'] = new Ev(function(arg1, arg2){ return arg1 >> arg2; });
	operators['<']  = new Ev(function(arg1, arg2){ return ( arg1 < arg2 ) ? 1 : 0; });
	operators['<='] = new Ev(function(arg1, arg2){ return ( arg1 <= arg2 ) ? 1 : 0; });
	operators['>']  = new Ev(function(arg1, arg2){ return ( arg1 > arg2 ) ? 1 : 0; });
	operators['>='] = new Ev(function(arg1, arg2){ return ( arg1 >= arg2 ) ? 1 : 0; });
	operators['=='] = new Ev(function(arg1, arg2){ return ( arg1 == arg2 ) ? 1 : 0; });
	operators['!='] = new Ev(function(arg1, arg2){ return ( arg1 != arg2 ) ? 1 : 0; });
	
	var c;
	while( c = stack2.pop() ){
		if( !operators[c] ) {
			stack1.push(c);
			continue;
		} else {
			var func = operators[c];
			var result = null;
			if(func.args == 1){
				var arg1 = stack1.pop();
				var arg1 = evaluate(arg1);
				result = func.ev(arg1);
			} else if(func.args == 2){
				var arg2 = evaluate(stack1.pop());
				var arg1 = evaluate(stack1.pop());
				result = func.ev(arg1, arg2);
			}
			stack1.push(result);
			continue;
		}
	}
	return tpl.evaluate(stack1.pop());
}

// configure the conf dict
Template.prototype.configure = function(conf){
	for(var i in conf){
		if(typeof(this.conf[i]) == "function" || typeof(conf[i]) == "function") continue;
		if(!this.conf[i]) continue;
		this.conf[i] = conf[i];
	}
}