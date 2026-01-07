export{ calculator, calculator_sse}

//The actual tool function
async function calculator(args){
    const a = Number(args.a);
    const b = Number(args.b);

     let result = 0;
     switch(args.operation){
     case "add":
        result = Number(a) + Number(b);
        break;
      case "subtract":
        result = Number(a) - Number(b);
        break;
      case "multiply":
        result = Number(a) * Number(b);
        break;
      case "divide":
        if (b === 0) throw new Error("Division by zero");
        result = Number(a) / Number(b);
        break;
    }

    return {
      content: [{ type: "text", text: `${result}` }],
    };
}



async function calculator_sse(args){
   // For some reason sse expects an expression, while stdio expects a,b, operation

    var split = args.expression.split(/([+\-*/()])/)
    const a = Number(split[0])
    const operation = split[1];
    const b = Number(args.expression.replace(split[0], "").replace(split[1], ""))
     let result = 0;
     switch(operation){
     case "+":
        result = Number(a) + Number(b);
        break;
      case "-":
        result = Number(a) - Number(b);
        break;
      case "*":
        result = Number(a) * Number(b);
        break;
      case "/":
        if (b === 0) throw new Error("Division by zero");
        result = Number(a) / Number(b);
        break;
    }

    return {
      content: [{ type: "text", text: `${result}` }],
    };
}