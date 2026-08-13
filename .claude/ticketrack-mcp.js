#!/usr/bin/env node
import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/lib/error.js
var require_error = __commonJS({
  "../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/lib/error.js"(exports) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @constructor
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       * @constructor
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
  }
});

// ../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/lib/argument.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @api private
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {any} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(`Allowed choices are ${this.argChoices.join(", ")}.`);
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports.Argument = Argument2;
    exports.humanReadableArgName = humanReadableArgName;
  }
});

// ../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/lib/help.js
var require_help = __commonJS({
  "../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/lib/help.js"(exports) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        if (cmd._hasImplicitHelpCommand()) {
          const [, helpName, helpArgs] = cmd._helpCommandnameAndArgs.match(/([^ ]+) *(.*)/);
          const helpCommand = cmd.createCommand(helpName).helpOption(false);
          helpCommand.description(cmd._helpCommandDescription);
          if (helpArgs) helpCommand.arguments(helpArgs);
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns number
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const showShortHelpFlag = cmd._hasHelpOption && cmd._helpShortFlag && !cmd._findOption(cmd._helpShortFlag);
        const showLongHelpFlag = cmd._hasHelpOption && !cmd._findOption(cmd._helpLongFlag);
        if (showShortHelpFlag || showLongHelpFlag) {
          let helpOption;
          if (!showShortHelpFlag) {
            helpOption = cmd.createOption(cmd._helpLongFlag, cmd._helpDescription);
          } else if (!showLongHelpFlag) {
            helpOption = cmd.createOption(cmd._helpShortFlag, cmd._helpDescription);
          } else {
            helpOption = cmd.createOption(cmd._helpFlags, cmd._helpDescription);
          }
          visibleOptions.push(helpOption);
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let parentCmd = cmd.parent; parentCmd; parentCmd = parentCmd.parent) {
          const visibleOptions = parentCmd.options.filter((option) => !option.hidden);
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd._args.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd._args.find((argument) => argument.description)) {
          return cmd._args;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd._args.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(max, helper.subcommandTerm(command).length);
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(max, helper.argumentTerm(argument).length);
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let parentCmdNames = "";
        for (let parentCmd = cmd.parent; parentCmd; parentCmd = parentCmd.parent) {
          parentCmdNames = parentCmd.name() + " " + parentCmdNames;
        }
        return parentCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(`default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(`default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`);
        }
        if (extraInfo.length > 0) {
          const extraDescripton = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescripton}`;
          }
          return extraDescripton;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth || 80;
        const itemIndentWidth = 2;
        const itemSeparatorWidth = 2;
        function formatItem(term, description) {
          if (description) {
            const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
            return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
          }
          return term;
        }
        function formatList(textArray) {
          return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
        }
        let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([commandDescription, ""]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument));
        });
        if (argumentList.length > 0) {
          output = output.concat(["Arguments:", formatList(argumentList), ""]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return formatItem(helper.optionTerm(option), helper.optionDescription(option));
        });
        if (optionList.length > 0) {
          output = output.concat(["Options:", formatList(optionList), ""]);
        }
        if (this.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return formatItem(helper.optionTerm(option), helper.optionDescription(option));
          });
          if (globalOptionList.length > 0) {
            output = output.concat(["Global Options:", formatList(globalOptionList), ""]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return formatItem(helper.subcommandTerm(cmd2), helper.subcommandDescription(cmd2));
        });
        if (commandList.length > 0) {
          output = output.concat(["Commands:", formatList(commandList), ""]);
        }
        return output.join("\n");
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Wrap the given string to width characters per line, with lines after the first indented.
       * Do not wrap if insufficient room for wrapping (minColumnWidth), or string is manually formatted.
       *
       * @param {string} str
       * @param {number} width
       * @param {number} indent
       * @param {number} [minColumnWidth=40]
       * @return {string}
       *
       */
      wrap(str2, width, indent, minColumnWidth = 40) {
        if (str2.match(/[\n]\s+/)) return str2;
        const columnWidth = width - indent;
        if (columnWidth < minColumnWidth) return str2;
        const leadingStr = str2.slice(0, indent);
        const columnText = str2.slice(indent);
        const indentString2 = " ".repeat(indent);
        const regex = new RegExp(".{1," + (columnWidth - 1) + "}([\\s\u200B]|$)|[^\\s\u200B]+?([\\s\u200B]|$)", "g");
        const lines = columnText.match(regex) || [];
        return leadingStr + lines.map((line, i2) => {
          if (line.slice(-1) === "\n") {
            line = line.slice(0, line.length - 1);
          }
          return (i2 > 0 ? indentString2 : "") + line.trimRight();
        }).join("\n");
      }
    };
    exports.Help = Help2;
  }
});

// ../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/lib/option.js
var require_option = __commonJS({
  "../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/lib/option.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {any} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {any} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {string | string[]} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {Object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        this.implied = Object.assign(this.implied || {}, impliedOptionValues);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @api private
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(`Allowed choices are ${this.argChoices.join(", ")}.`);
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as a object attribute key.
       *
       * @return {string}
       * @api private
       */
      attributeName() {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @api private
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @api private
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {any} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str2) {
      return str2.split("-").reduce((str3, word) => {
        return str3 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const flagParts = flags.split(/[ |,]+/);
      if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1])) shortFlag = flagParts.shift();
      longFlag = flagParts.shift();
      if (!shortFlag && /^-[^-]$/.test(longFlag)) {
        shortFlag = longFlag;
        longFlag = void 0;
      }
      return { shortFlag, longFlag };
    }
    exports.Option = Option2;
    exports.splitOptionFlags = splitOptionFlags;
    exports.DualOptions = DualOptions;
  }
});

// ../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/lib/suggestSimilar.js"(exports) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance) return Math.max(a.length, b.length);
      const d = [];
      for (let i2 = 0; i2 <= a.length; i2++) {
        d[i2] = [i2];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i2 = 1; i2 <= a.length; i2++) {
          let cost = 1;
          if (a[i2 - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i2][j] = Math.min(
            d[i2 - 1][j] + 1,
            // deletion
            d[i2][j - 1] + 1,
            // insertion
            d[i2 - 1][j - 1] + cost
            // substitution
          );
          if (i2 > 1 && j > 1 && a[i2 - 1] === b[j - 2] && a[i2 - 2] === b[j - 1]) {
            d[i2][j] = Math.min(d[i2][j], d[i2 - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports.suggestSimilar = suggestSimilar;
  }
});

// ../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/lib/command.js
var require_command = __commonJS({
  "../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/lib/command.js"(exports) {
    var EventEmitter4 = __require("events").EventEmitter;
    var childProcess = __require("child_process");
    var path4 = __require("path");
    var fs3 = __require("fs");
    var process3 = __require("process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2, splitOptionFlags, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter4 {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = true;
        this._args = [];
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._outputConfiguration = {
          writeOut: (str2) => process3.stdout.write(str2),
          writeErr: (str2) => process3.stderr.write(str2),
          getOutHelpWidth: () => process3.stdout.isTTY ? process3.stdout.columns : void 0,
          getErrHelpWidth: () => process3.stderr.isTTY ? process3.stderr.columns : void 0,
          outputError: (str2, write) => write(str2)
        };
        this._hidden = false;
        this._hasHelpOption = true;
        this._helpFlags = "-h, --help";
        this._helpDescription = "display help for command";
        this._helpShortFlag = "-h";
        this._helpLongFlag = "--help";
        this._addImplicitHelpCommand = void 0;
        this._helpCommandName = "help";
        this._helpCommandnameAndArgs = "help [command]";
        this._helpCommandDescription = "display help for command";
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._hasHelpOption = sourceCommand._hasHelpOption;
        this._helpFlags = sourceCommand._helpFlags;
        this._helpDescription = sourceCommand._helpDescription;
        this._helpShortFlag = sourceCommand._helpShortFlag;
        this._helpLongFlag = sourceCommand._helpLongFlag;
        this._helpCommandName = sourceCommand._helpCommandName;
        this._helpCommandnameAndArgs = sourceCommand._helpCommandnameAndArgs;
        this._helpCommandDescription = sourceCommand._helpCommandDescription;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {Object|string} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {Object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this.commands.push(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {Object} [configuration] - configuration options
       * @return {Command|Object} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // functions to change where being written, stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // matching functions to specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // functions based on what is being written out
       *     outputError(str, write) // used for displaying errors, and not used for displaying help
       *
       * @param {Object} [configuration] - configuration options
       * @return {Command|Object} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {boolean|string} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {Object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this.commands.push(cmd);
        cmd.parent = this;
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {Function|*} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this._args.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`);
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(`a default value for a required argument is never used: '${argument.name()}'`);
        }
        this._args.push(argument);
        return this;
      }
      /**
       * Override default decision whether to add implicit help command.
       *
       *    addHelpCommand() // force on
       *    addHelpCommand(false); // force off
       *    addHelpCommand('help [cmd]', 'display help for [cmd]'); // force on with custom details
       *
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(enableOrNameAndArgs, description) {
        if (enableOrNameAndArgs === false) {
          this._addImplicitHelpCommand = false;
        } else {
          this._addImplicitHelpCommand = true;
          if (typeof enableOrNameAndArgs === "string") {
            this._helpCommandName = enableOrNameAndArgs.split(" ")[0];
            this._helpCommandnameAndArgs = enableOrNameAndArgs;
          }
          this._helpCommandDescription = description || this._helpCommandDescription;
        }
        return this;
      }
      /**
       * @return {boolean}
       * @api private
       */
      _hasImplicitHelpCommand() {
        if (this._addImplicitHelpCommand === void 0) {
          return this.commands.length && !this._actionHandler && !this._findCommand("help");
        }
        return this._addImplicitHelpCommand;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @api private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process3.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this._args.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(name, option.defaultValue === void 0 ? true : option.defaultValue, "default");
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        this.options.push(option);
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            try {
              val = option.parseArg(val, oldValue);
            } catch (err) {
              if (err.code === "commander.invalidArgument") {
                const message = `${invalidValueMessage} ${err.message}`;
                this.error(message, { exitCode: err.exitCode, code: err.code });
              }
              throw err;
            }
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @api private
       */
      _optionEx(config2, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error("To add an Option object use addOption() instead of option() or requiredOption()");
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config2.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description` and optional
       * coercion `fn`.
       *
       * The `flags` string contains the short and/or long flags,
       * separated by comma, a pipe or space. The following are all valid
       * all will output this way when `--help` is used.
       *
       *     "-p, --pepper"
       *     "-p|--pepper"
       *     "-p --pepper"
       *
       * @example
       * // simple boolean defaulting to undefined
       * program.option('-p, --pepper', 'add pepper');
       *
       * program.pepper
       * // => undefined
       *
       * --pepper
       * program.pepper
       * // => true
       *
       * // simple boolean defaulting to true (unless non-negated option is also defined)
       * program.option('-C, --no-cheese', 'remove cheese');
       *
       * program.cheese
       * // => true
       *
       * --no-cheese
       * program.cheese
       * // => false
       *
       * // required argument
       * program.option('-C, --chdir <path>', 'change the working directory');
       *
       * --chdir /tmp
       * program.chdir
       * // => "/tmp"
       *
       * // optional argument
       * program.option('-c, --cheese [type]', 'add cheese [marble]');
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {Function|*} [fn] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, fn, defaultValue) {
        return this._optionEx({}, flags, description, fn, defaultValue);
      }
      /**
      * Add a required option which must have a value after parsing. This usually means
      * the option must be specified on the command line. (Otherwise the same as .option().)
      *
      * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
      *
      * @param {string} flags
      * @param {string} [description]
      * @param {Function|*} [fn] - custom option processing function or default value
      * @param {*} [defaultValue]
      * @return {Command} `this` command for chaining
      */
      requiredOption(flags, description, fn, defaultValue) {
        return this._optionEx({ mandatory: true }, flags, description, fn, defaultValue);
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {Boolean} [combine=true] - if `true` or omitted, an optional value can be specified directly after the flag.
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {Boolean} [allowUnknown=true] - if `true` or omitted, no error will be thrown
       * for unknown options.
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {Boolean} [allowExcess=true] - if `true` or omitted, no error will be thrown
       * for excess arguments.
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {Boolean} [positional=true]
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {Boolean} [passThrough=true]
       * for unknown options.
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        if (!!this.parent && passThrough && !this.parent._enablePositionalOptions) {
          throw new Error("passThroughOptions can not be used without turning on enablePositionalOptions for parent command(s)");
        }
        return this;
      }
      /**
        * Whether to store option values as properties on command object,
        * or store separately (specify false). In both cases the option values can be accessed using .opts().
        *
        * @param {boolean} [storeAsProperties=true]
        * @return {Command} `this` command for chaining
        */
      storeOptionsAsProperties(storeAsProperties = true) {
        this._storeOptionsAsProperties = !!storeAsProperties;
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {Object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {Object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
        * Store option value and where the value came from.
        *
        * @param {string} key
        * @param {Object} value
        * @param {string} source - expected values are default/config/env/cli/implied
        * @return {Command} `this` command for chaining
        */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
        * Get source of option value.
        * Expected values are default | config | env | cli | implied
        *
        * @param {string} key
        * @return {string}
        */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
        * Get source of option value. See also .optsWithGlobals().
        * Expected values are default | config | env | cli | implied
        *
        * @param {string} key
        * @return {string}
        */
      getOptionValueSourceWithGlobals(key) {
        let source;
        getCommandAndParents(this).forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @api private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0) {
          argv = process3.argv;
          if (process3.versions && process3.versions.electron) {
            parseOptions.from = "electron";
          }
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process3.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          default:
            throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`);
        }
        if (!this._name && this._scriptPath) this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * The default expectation is that the arguments are from node and have the application as argv[0]
       * and the script being run in argv[1], with user parameters after that.
       *
       * @example
       * program.parse(process.argv);
       * program.parse(); // implicitly use process.argv and auto-detect node vs electron conventions
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {Object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async. Returns a Promise.
       *
       * The default expectation is that the arguments are from node and have the application as argv[0]
       * and the script being run in argv[1], with user parameters after that.
       *
       * @example
       * await program.parseAsync(process.argv);
       * await program.parseAsync(); // implicitly use process.argv and auto-detect node vs electron conventions
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {Object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Execute a sub-command executable.
       *
       * @api private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path4.resolve(baseDir, baseName);
          if (fs3.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path4.extname(baseName))) return void 0;
          const foundExt = sourceExt.find((ext) => fs3.existsSync(`${localBin}${ext}`));
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs3.realpathSync(this._scriptPath);
          } catch (err) {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path4.resolve(path4.dirname(resolvedScriptPath), executableDir);
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path4.basename(this._scriptPath, path4.extname(this._scriptPath));
            if (legacyName !== this._name) {
              localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`);
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path4.extname(executableFile));
        let proc;
        if (process3.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process3.execArgv).concat(args);
            proc = childProcess.spawn(process3.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process3.execArgv).concat(args);
          proc = childProcess.spawn(process3.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process3.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        if (!exitCallback) {
          proc.on("close", process3.exit.bind(process3));
        } else {
          proc.on("close", () => {
            exitCallback(new CommanderError2(process3.exitCode || 0, "commander.executeSubCommandAsync", "(close)"));
          });
        }
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
            const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
            throw new Error(executableMissing);
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process3.exit(1);
          } else {
            const wrappedError = new CommanderError2(1, "commander.executeSubCommandAsync", "(error)");
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @api private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        let hookResult;
        hookResult = this._chainOrCallSubCommandHook(hookResult, subCommand, "preSubcommand");
        hookResult = this._chainOrCall(hookResult, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return hookResult;
      }
      /**
       * Check this.args against expected this._args.
       *
       * @api private
       */
      _checkNumberOfArguments() {
        this._args.forEach((arg, i2) => {
          if (arg.required && this.args[i2] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this._args.length > 0 && this._args[this._args.length - 1].variadic) {
          return;
        }
        if (this.args.length > this._args.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this._args and save as this.processedArgs!
       *
       * @api private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            try {
              parsedValue = argument.parseArg(value, previous);
            } catch (err) {
              if (err.code === "commander.invalidArgument") {
                const message = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'. ${err.message}`;
                this.error(message, { exitCode: err.exitCode, code: err.code });
              }
              throw err;
            }
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this._args.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {Promise|undefined} promise
       * @param {Function} fn
       * @return {Promise|undefined}
       * @api private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {Promise|undefined} promise
       * @param {string} event
       * @return {Promise|undefined}
       * @api private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        getCommandAndParents(this).reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {Promise|undefined} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {Promise|undefined}
       * @api private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @api private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._hasImplicitHelpCommand() && operands[0] === this._helpCommandName) {
          if (operands.length === 1) {
            this.help();
          }
          return this._dispatchSubcommand(operands[1], [], [this._helpLongFlag]);
        }
        if (this._defaultCommandName) {
          outputHelpIfRequested(this, unknown);
          return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        outputHelpIfRequested(this, parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let actionResult;
          actionResult = this._chainOrCallHooks(actionResult, "preAction");
          actionResult = this._chainOrCall(actionResult, () => this._actionHandler(this.processedArgs));
          if (this.parent) {
            actionResult = this._chainOrCall(actionResult, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          actionResult = this._chainOrCallHooks(actionResult, "postAction");
          return actionResult;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @api private
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find((cmd) => cmd._name === name || cmd._aliases.includes(name));
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @api private
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @api private
       */
      _checkForMissingMandatoryOptions() {
        for (let cmd = this; cmd; cmd = cmd.parent) {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        }
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @api private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter(
          (option) => {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0) {
              return false;
            }
            return this.getOptionValueSource(optionKey) !== "default";
          }
        );
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @api private
       */
      _checkForConflictingOptions() {
        for (let cmd = this; cmd; cmd = cmd.parent) {
          cmd._checkForConflictingLocalOptions();
        }
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {String[]} argv
       * @return {{operands: String[], unknown: String[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            } else if (arg === this._helpCommandName && this._hasImplicitHelpCommand()) {
              operands.push(arg);
              if (args.length > 0) operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0) dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {Object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i2 = 0; i2 < len; i2++) {
            const key = this.options[i2].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {Object}
       */
      optsWithGlobals() {
        return getCommandAndParents(this).reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {Object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(`${message}
`, this._outputConfiguration.writeErr);
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config2 = errorOptions || {};
        const exitCode = config2.exitCode || 1;
        const code = config2.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @api private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process3.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(this.getOptionValueSource(optionKey))) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process3.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @api private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter((option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(this.getOptionValue(option.attributeName()), option)).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(impliedKey, option.implied[impliedKey], "implied");
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @api private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @api private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @api private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @api private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find((target) => target.negate && optionKey === target.attributeName());
          const positiveOption = this.options.find((target) => !target.negate && optionKey === target.attributeName());
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @api private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @api private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this._args.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @api private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Set the program version to `str`.
       *
       * This method auto-registers the "-V, --version" flag
       * which will print the version number when passed.
       *
       * You can optionally supply the  flags and description to override the defaults.
       *
       * @param {string} str
       * @param {string} [flags]
       * @param {string} [description]
       * @return {this | string} `this` command for chaining, or version string if no arguments
       */
      version(str2, flags, description) {
        if (str2 === void 0) return this._version;
        this._version = str2;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this.options.push(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str2}
`);
          this._exit(0, "commander.version", str2);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {Object} [argsDescription]
       * @return {string|Command}
       */
      description(str2, argsDescription) {
        if (str2 === void 0 && argsDescription === void 0) return this._description;
        this._description = str2;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {string|Command}
       */
      summary(str2) {
        if (str2 === void 0) return this._summary;
        this._summary = str2;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {string|Command}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name) throw new Error("Command alias can't be the same as its name");
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {string[]|Command}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {String|Command}
       */
      usage(str2) {
        if (str2 === void 0) {
          if (this._usage) return this._usage;
          const args = this._args.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._hasHelpOption ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this._args.length ? args : []
          ).join(" ");
        }
        this._usage = str2;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {string|Command}
       */
      name(str2) {
        if (str2 === void 0) return this._name;
        this._name = str2;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path4.basename(filename, path4.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {string|Command}
       */
      executableDir(path5) {
        if (path5 === void 0) return this._executableDir;
        this._executableDir = path5;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        if (helper.helpWidth === void 0) {
          helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
        }
        return helper.formatHelp(this, helper);
      }
      /**
       * @api private
       */
      _getHelpContext(contextOptions) {
        contextOptions = contextOptions || {};
        const context = { error: !!contextOptions.error };
        let write;
        if (context.error) {
          write = (arg) => this._outputConfiguration.writeErr(arg);
        } else {
          write = (arg) => this._outputConfiguration.writeOut(arg);
        }
        context.write = contextOptions.write || write;
        context.command = this;
        return context;
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const context = this._getHelpContext(contextOptions);
        getCommandAndParents(this).reverse().forEach((command) => command.emit("beforeAllHelp", context));
        this.emit("beforeHelp", context);
        let helpInformation = this.helpInformation(context);
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        context.write(helpInformation);
        this.emit(this._helpLongFlag);
        this.emit("afterHelp", context);
        getCommandAndParents(this).forEach((command) => command.emit("afterAllHelp", context));
      }
      /**
       * You can pass in flags and a description to override the help
       * flags and help description for your command. Pass in false to
       * disable the built-in help option.
       *
       * @param {string | boolean} [flags]
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          this._hasHelpOption = flags;
          return this;
        }
        this._helpFlags = flags || this._helpFlags;
        this._helpDescription = description || this._helpDescription;
        const helpFlags = splitOptionFlags(this._helpFlags);
        this._helpShortFlag = helpFlags.shortFlag;
        this._helpLongFlag = helpFlags.longFlag;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = process3.exitCode || 0;
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {string | Function} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text === "function") {
            helpStr = text({ error: context.error, command: context.command });
          } else {
            helpStr = text;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
    };
    function outputHelpIfRequested(cmd, args) {
      const helpOption = cmd._hasHelpOption && args.find((arg) => arg === cmd._helpLongFlag || arg === cmd._helpShortFlag);
      if (helpOption) {
        cmd.outputHelp();
        cmd._exit(0, "commander.helpDisplayed", "(outputHelp)");
      }
    }
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    function getCommandAndParents(startCommand) {
      const result = [];
      for (let command = startCommand; command; command = command.parent) {
        result.push(command);
      }
      return result;
    }
    exports.Command = Command2;
  }
});

// ../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/index.js
var require_commander = __commonJS({
  "../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/index.js"(exports, module) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports = module.exports = new Command2();
    exports.program = exports;
    exports.Argument = Argument2;
    exports.Command = Command2;
    exports.CommanderError = CommanderError2;
    exports.Help = Help2;
    exports.InvalidArgumentError = InvalidArgumentError2;
    exports.InvalidOptionArgumentError = InvalidArgumentError2;
    exports.Option = Option2;
  }
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json2 = JSON.stringify(obj, null, 2);
  return json2.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i2 = 0;
          while (i2 < issue.path.length) {
            const el = issue.path[i2];
            const terminal = i2 === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i2++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map2) {
  overrideErrorMap = map2;
}
function getErrorMap() {
  return overrideErrorMap;
}

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path: path4, errorMaps, issueData } = params;
  const fullPath = [...path4, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map2 of maps) {
    errorMessage = map2(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs2) {
    const syncPairs = [];
    for (const pair of pairs2) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs2) {
    const finalObject = {};
    for (const pair of pairs2) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path4, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path4;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i2) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i2));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i2) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i2));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema2, params) => {
  return new ZodArray({
    type: schema2,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema2) {
  if (schema2 instanceof ZodObject) {
    const newShape = {};
    for (const key in schema2.shape) {
      const fieldSchema = schema2.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema2._def,
      shape: () => newShape
    });
  } else if (schema2 instanceof ZodArray) {
    return new ZodArray({
      ...schema2._def,
      type: deepPartialify(schema2.element)
    });
  } else if (schema2 instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema2.unwrap()));
  } else if (schema2 instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema2.unwrap()));
  } else if (schema2 instanceof ZodTuple) {
    return ZodTuple.create(schema2.items.map((item) => deepPartialify(item)));
  } else {
    return schema2;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs2 = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs2.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs2.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs2.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs2) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs2);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema2) {
    return this.augment({ [key]: schema2 });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type2) => {
  if (type2 instanceof ZodLazy) {
    return getDiscriminator(type2.schema);
  } else if (type2 instanceof ZodEffects) {
    return getDiscriminator(type2.innerType());
  } else if (type2 instanceof ZodLiteral) {
    return [type2.value];
  } else if (type2 instanceof ZodEnum) {
    return type2.options;
  } else if (type2 instanceof ZodNativeEnum) {
    return util.objectValues(type2.enum);
  } else if (type2 instanceof ZodDefault) {
    return getDiscriminator(type2._def.innerType);
  } else if (type2 instanceof ZodUndefined) {
    return [void 0];
  } else if (type2 instanceof ZodNull) {
    return [null];
  } else if (type2 instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type2.unwrap())];
  } else if (type2 instanceof ZodNullable) {
    return [null, ...getDiscriminator(type2.unwrap())];
  } else if (type2 instanceof ZodBranded) {
    return getDiscriminator(type2.unwrap());
  } else if (type2 instanceof ZodReadonly) {
    return getDiscriminator(type2.unwrap());
  } else if (type2 instanceof ZodCatch) {
    return getDiscriminator(type2._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type2 of options) {
      const discriminatorValues = getDiscriminator(type2.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type2);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema2 = this._def.items[itemIndex] || this._def.rest;
      if (!schema2)
        return null;
      return schema2._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs2 = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs2.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs2);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs2);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs2 = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs2) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs2) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i2) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i2)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema2, params) => {
  return new ZodPromise({
    type: schema2,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base2 = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base2))
          return INVALID;
        const result = effect.transform(base2.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base2) => {
          if (!isValid(base2))
            return INVALID;
          return Promise.resolve(effect.transform(base2.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema2, effect, params) => {
  return new ZodEffects({
    schema: schema2,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema2, params) => {
  return new ZodEffects({
    schema: schema2,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type2, params) => {
  return new ZodOptional({
    innerType: type2,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type2, params) => {
  return new ZodNullable({
    innerType: type2,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type2, params) => {
  return new ZodDefault({
    innerType: type2,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type2, params) => {
  return new ZodCatch({
    innerType: type2,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type2, params) => {
  return new ZodReadonly({
    innerType: type2,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// ../../node_modules/.pnpm/@modelcontextprotocol+sdk@0.5.0/node_modules/@modelcontextprotocol/sdk/dist/types.js
var LATEST_PROTOCOL_VERSION = "2024-11-05";
var SUPPORTED_PROTOCOL_VERSIONS = [
  LATEST_PROTOCOL_VERSION,
  "2024-10-07"
];
var JSONRPC_VERSION = "2.0";
var ProgressTokenSchema = external_exports.union([external_exports.string(), external_exports.number().int()]);
var CursorSchema = external_exports.string();
var BaseRequestParamsSchema = external_exports.object({
  _meta: external_exports.optional(external_exports.object({
    /**
     * If specified, the caller is requesting out-of-band progress notifications for this request (as represented by notifications/progress). The value of this parameter is an opaque token that will be attached to any subsequent notifications. The receiver is not obligated to provide these notifications.
     */
    progressToken: external_exports.optional(ProgressTokenSchema)
  }).passthrough())
}).passthrough();
var RequestSchema = external_exports.object({
  method: external_exports.string(),
  params: external_exports.optional(BaseRequestParamsSchema)
});
var BaseNotificationParamsSchema = external_exports.object({
  /**
   * This parameter name is reserved by MCP to allow clients and servers to attach additional metadata to their notifications.
   */
  _meta: external_exports.optional(external_exports.object({}).passthrough())
}).passthrough();
var NotificationSchema = external_exports.object({
  method: external_exports.string(),
  params: external_exports.optional(BaseNotificationParamsSchema)
});
var ResultSchema = external_exports.object({
  /**
   * This result property is reserved by the protocol to allow clients and servers to attach additional metadata to their responses.
   */
  _meta: external_exports.optional(external_exports.object({}).passthrough())
}).passthrough();
var RequestIdSchema = external_exports.union([external_exports.string(), external_exports.number().int()]);
var JSONRPCRequestSchema = external_exports.object({
  jsonrpc: external_exports.literal(JSONRPC_VERSION),
  id: RequestIdSchema
}).merge(RequestSchema).strict();
var JSONRPCNotificationSchema = external_exports.object({
  jsonrpc: external_exports.literal(JSONRPC_VERSION)
}).merge(NotificationSchema).strict();
var JSONRPCResponseSchema = external_exports.object({
  jsonrpc: external_exports.literal(JSONRPC_VERSION),
  id: RequestIdSchema,
  result: ResultSchema
}).strict();
var ErrorCode;
(function(ErrorCode2) {
  ErrorCode2[ErrorCode2["ConnectionClosed"] = -1] = "ConnectionClosed";
  ErrorCode2[ErrorCode2["ParseError"] = -32700] = "ParseError";
  ErrorCode2[ErrorCode2["InvalidRequest"] = -32600] = "InvalidRequest";
  ErrorCode2[ErrorCode2["MethodNotFound"] = -32601] = "MethodNotFound";
  ErrorCode2[ErrorCode2["InvalidParams"] = -32602] = "InvalidParams";
  ErrorCode2[ErrorCode2["InternalError"] = -32603] = "InternalError";
})(ErrorCode || (ErrorCode = {}));
var JSONRPCErrorSchema = external_exports.object({
  jsonrpc: external_exports.literal(JSONRPC_VERSION),
  id: RequestIdSchema,
  error: external_exports.object({
    /**
     * The error type that occurred.
     */
    code: external_exports.number().int(),
    /**
     * A short description of the error. The message SHOULD be limited to a concise single sentence.
     */
    message: external_exports.string(),
    /**
     * Additional information about the error. The value of this member is defined by the sender (e.g. detailed error information, nested errors etc.).
     */
    data: external_exports.optional(external_exports.unknown())
  })
}).strict();
var JSONRPCMessageSchema = external_exports.union([
  JSONRPCRequestSchema,
  JSONRPCNotificationSchema,
  JSONRPCResponseSchema,
  JSONRPCErrorSchema
]);
var EmptyResultSchema = ResultSchema.strict();
var CancelledNotificationSchema = NotificationSchema.extend({
  method: external_exports.literal("notifications/cancelled"),
  params: BaseNotificationParamsSchema.extend({
    /**
     * The ID of the request to cancel.
     *
     * This MUST correspond to the ID of a request previously issued in the same direction.
     */
    requestId: RequestIdSchema,
    /**
     * An optional string describing the reason for the cancellation. This MAY be logged or presented to the user.
     */
    reason: external_exports.string().optional()
  })
});
var ImplementationSchema = external_exports.object({
  name: external_exports.string(),
  version: external_exports.string()
}).passthrough();
var ClientCapabilitiesSchema = external_exports.object({
  /**
   * Experimental, non-standard capabilities that the client supports.
   */
  experimental: external_exports.optional(external_exports.object({}).passthrough()),
  /**
   * Present if the client supports sampling from an LLM.
   */
  sampling: external_exports.optional(external_exports.object({}).passthrough()),
  /**
   * Present if the client supports listing roots.
   */
  roots: external_exports.optional(external_exports.object({
    /**
     * Whether the client supports issuing notifications for changes to the roots list.
     */
    listChanged: external_exports.optional(external_exports.boolean())
  }).passthrough())
}).passthrough();
var InitializeRequestSchema = RequestSchema.extend({
  method: external_exports.literal("initialize"),
  params: BaseRequestParamsSchema.extend({
    /**
     * The latest version of the Model Context Protocol that the client supports. The client MAY decide to support older versions as well.
     */
    protocolVersion: external_exports.string(),
    capabilities: ClientCapabilitiesSchema,
    clientInfo: ImplementationSchema
  })
});
var ServerCapabilitiesSchema = external_exports.object({
  /**
   * Experimental, non-standard capabilities that the server supports.
   */
  experimental: external_exports.optional(external_exports.object({}).passthrough()),
  /**
   * Present if the server supports sending log messages to the client.
   */
  logging: external_exports.optional(external_exports.object({}).passthrough()),
  /**
   * Present if the server offers any prompt templates.
   */
  prompts: external_exports.optional(external_exports.object({
    /**
     * Whether this server supports issuing notifications for changes to the prompt list.
     */
    listChanged: external_exports.optional(external_exports.boolean())
  }).passthrough()),
  /**
   * Present if the server offers any resources to read.
   */
  resources: external_exports.optional(external_exports.object({
    /**
     * Whether this server supports clients subscribing to resource updates.
     */
    subscribe: external_exports.optional(external_exports.boolean()),
    /**
     * Whether this server supports issuing notifications for changes to the resource list.
     */
    listChanged: external_exports.optional(external_exports.boolean())
  }).passthrough()),
  /**
   * Present if the server offers any tools to call.
   */
  tools: external_exports.optional(external_exports.object({
    /**
     * Whether this server supports issuing notifications for changes to the tool list.
     */
    listChanged: external_exports.optional(external_exports.boolean())
  }).passthrough())
}).passthrough();
var InitializeResultSchema = ResultSchema.extend({
  /**
   * The version of the Model Context Protocol that the server wants to use. This may not match the version that the client requested. If the client cannot support this version, it MUST disconnect.
   */
  protocolVersion: external_exports.string(),
  capabilities: ServerCapabilitiesSchema,
  serverInfo: ImplementationSchema
});
var InitializedNotificationSchema = NotificationSchema.extend({
  method: external_exports.literal("notifications/initialized")
});
var PingRequestSchema = RequestSchema.extend({
  method: external_exports.literal("ping")
});
var ProgressSchema = external_exports.object({
  /**
   * The progress thus far. This should increase every time progress is made, even if the total is unknown.
   */
  progress: external_exports.number(),
  /**
   * Total number of items to process (or total progress required), if known.
   */
  total: external_exports.optional(external_exports.number())
}).passthrough();
var ProgressNotificationSchema = NotificationSchema.extend({
  method: external_exports.literal("notifications/progress"),
  params: BaseNotificationParamsSchema.merge(ProgressSchema).extend({
    /**
     * The progress token which was given in the initial request, used to associate this notification with the request that is proceeding.
     */
    progressToken: ProgressTokenSchema
  })
});
var PaginatedRequestSchema = RequestSchema.extend({
  params: BaseRequestParamsSchema.extend({
    /**
     * An opaque token representing the current pagination position.
     * If provided, the server should return results starting after this cursor.
     */
    cursor: external_exports.optional(CursorSchema)
  }).optional()
});
var PaginatedResultSchema = ResultSchema.extend({
  /**
   * An opaque token representing the pagination position after the last returned result.
   * If present, there may be more results available.
   */
  nextCursor: external_exports.optional(CursorSchema)
});
var ResourceContentsSchema = external_exports.object({
  /**
   * The URI of this resource.
   */
  uri: external_exports.string(),
  /**
   * The MIME type of this resource, if known.
   */
  mimeType: external_exports.optional(external_exports.string())
}).passthrough();
var TextResourceContentsSchema = ResourceContentsSchema.extend({
  /**
   * The text of the item. This must only be set if the item can actually be represented as text (not binary data).
   */
  text: external_exports.string()
});
var BlobResourceContentsSchema = ResourceContentsSchema.extend({
  /**
   * A base64-encoded string representing the binary data of the item.
   */
  blob: external_exports.string().base64()
});
var ResourceSchema = external_exports.object({
  /**
   * The URI of this resource.
   */
  uri: external_exports.string(),
  /**
   * A human-readable name for this resource.
   *
   * This can be used by clients to populate UI elements.
   */
  name: external_exports.string(),
  /**
   * A description of what this resource represents.
   *
   * This can be used by clients to improve the LLM's understanding of available resources. It can be thought of like a "hint" to the model.
   */
  description: external_exports.optional(external_exports.string()),
  /**
   * The MIME type of this resource, if known.
   */
  mimeType: external_exports.optional(external_exports.string())
}).passthrough();
var ResourceTemplateSchema = external_exports.object({
  /**
   * A URI template (according to RFC 6570) that can be used to construct resource URIs.
   */
  uriTemplate: external_exports.string(),
  /**
   * A human-readable name for the type of resource this template refers to.
   *
   * This can be used by clients to populate UI elements.
   */
  name: external_exports.string(),
  /**
   * A description of what this template is for.
   *
   * This can be used by clients to improve the LLM's understanding of available resources. It can be thought of like a "hint" to the model.
   */
  description: external_exports.optional(external_exports.string()),
  /**
   * The MIME type for all resources that match this template. This should only be included if all resources matching this template have the same type.
   */
  mimeType: external_exports.optional(external_exports.string())
}).passthrough();
var ListResourcesRequestSchema = PaginatedRequestSchema.extend({
  method: external_exports.literal("resources/list")
});
var ListResourcesResultSchema = PaginatedResultSchema.extend({
  resources: external_exports.array(ResourceSchema)
});
var ListResourceTemplatesRequestSchema = PaginatedRequestSchema.extend({
  method: external_exports.literal("resources/templates/list")
});
var ListResourceTemplatesResultSchema = PaginatedResultSchema.extend({
  resourceTemplates: external_exports.array(ResourceTemplateSchema)
});
var ReadResourceRequestSchema = RequestSchema.extend({
  method: external_exports.literal("resources/read"),
  params: BaseRequestParamsSchema.extend({
    /**
     * The URI of the resource to read. The URI can use any protocol; it is up to the server how to interpret it.
     */
    uri: external_exports.string()
  })
});
var ReadResourceResultSchema = ResultSchema.extend({
  contents: external_exports.array(external_exports.union([TextResourceContentsSchema, BlobResourceContentsSchema]))
});
var ResourceListChangedNotificationSchema = NotificationSchema.extend({
  method: external_exports.literal("notifications/resources/list_changed")
});
var SubscribeRequestSchema = RequestSchema.extend({
  method: external_exports.literal("resources/subscribe"),
  params: BaseRequestParamsSchema.extend({
    /**
     * The URI of the resource to subscribe to. The URI can use any protocol; it is up to the server how to interpret it.
     */
    uri: external_exports.string()
  })
});
var UnsubscribeRequestSchema = RequestSchema.extend({
  method: external_exports.literal("resources/unsubscribe"),
  params: BaseRequestParamsSchema.extend({
    /**
     * The URI of the resource to unsubscribe from.
     */
    uri: external_exports.string()
  })
});
var ResourceUpdatedNotificationSchema = NotificationSchema.extend({
  method: external_exports.literal("notifications/resources/updated"),
  params: BaseNotificationParamsSchema.extend({
    /**
     * The URI of the resource that has been updated. This might be a sub-resource of the one that the client actually subscribed to.
     */
    uri: external_exports.string()
  })
});
var PromptArgumentSchema = external_exports.object({
  /**
   * The name of the argument.
   */
  name: external_exports.string(),
  /**
   * A human-readable description of the argument.
   */
  description: external_exports.optional(external_exports.string()),
  /**
   * Whether this argument must be provided.
   */
  required: external_exports.optional(external_exports.boolean())
}).passthrough();
var PromptSchema = external_exports.object({
  /**
   * The name of the prompt or prompt template.
   */
  name: external_exports.string(),
  /**
   * An optional description of what this prompt provides
   */
  description: external_exports.optional(external_exports.string()),
  /**
   * A list of arguments to use for templating the prompt.
   */
  arguments: external_exports.optional(external_exports.array(PromptArgumentSchema))
}).passthrough();
var ListPromptsRequestSchema = PaginatedRequestSchema.extend({
  method: external_exports.literal("prompts/list")
});
var ListPromptsResultSchema = PaginatedResultSchema.extend({
  prompts: external_exports.array(PromptSchema)
});
var GetPromptRequestSchema = RequestSchema.extend({
  method: external_exports.literal("prompts/get"),
  params: BaseRequestParamsSchema.extend({
    /**
     * The name of the prompt or prompt template.
     */
    name: external_exports.string(),
    /**
     * Arguments to use for templating the prompt.
     */
    arguments: external_exports.optional(external_exports.record(external_exports.string()))
  })
});
var TextContentSchema = external_exports.object({
  type: external_exports.literal("text"),
  /**
   * The text content of the message.
   */
  text: external_exports.string()
}).passthrough();
var ImageContentSchema = external_exports.object({
  type: external_exports.literal("image"),
  /**
   * The base64-encoded image data.
   */
  data: external_exports.string().base64(),
  /**
   * The MIME type of the image. Different providers may support different image types.
   */
  mimeType: external_exports.string()
}).passthrough();
var EmbeddedResourceSchema = external_exports.object({
  type: external_exports.literal("resource"),
  resource: external_exports.union([TextResourceContentsSchema, BlobResourceContentsSchema])
}).passthrough();
var PromptMessageSchema = external_exports.object({
  role: external_exports.enum(["user", "assistant"]),
  content: external_exports.union([
    TextContentSchema,
    ImageContentSchema,
    EmbeddedResourceSchema
  ])
}).passthrough();
var GetPromptResultSchema = ResultSchema.extend({
  /**
   * An optional description for the prompt.
   */
  description: external_exports.optional(external_exports.string()),
  messages: external_exports.array(PromptMessageSchema)
});
var PromptListChangedNotificationSchema = NotificationSchema.extend({
  method: external_exports.literal("notifications/prompts/list_changed")
});
var ToolSchema = external_exports.object({
  /**
   * The name of the tool.
   */
  name: external_exports.string(),
  /**
   * A human-readable description of the tool.
   */
  description: external_exports.optional(external_exports.string()),
  /**
   * A JSON Schema object defining the expected parameters for the tool.
   */
  inputSchema: external_exports.object({
    type: external_exports.literal("object"),
    properties: external_exports.optional(external_exports.object({}).passthrough())
  }).passthrough()
}).passthrough();
var ListToolsRequestSchema = PaginatedRequestSchema.extend({
  method: external_exports.literal("tools/list")
});
var ListToolsResultSchema = PaginatedResultSchema.extend({
  tools: external_exports.array(ToolSchema)
});
var CallToolResultSchema = ResultSchema.extend({
  content: external_exports.array(external_exports.union([TextContentSchema, ImageContentSchema, EmbeddedResourceSchema])),
  isError: external_exports.boolean().default(false).optional()
});
var CompatibilityCallToolResultSchema = CallToolResultSchema.or(ResultSchema.extend({
  toolResult: external_exports.unknown()
}));
var CallToolRequestSchema = RequestSchema.extend({
  method: external_exports.literal("tools/call"),
  params: BaseRequestParamsSchema.extend({
    name: external_exports.string(),
    arguments: external_exports.optional(external_exports.record(external_exports.unknown()))
  })
});
var ToolListChangedNotificationSchema = NotificationSchema.extend({
  method: external_exports.literal("notifications/tools/list_changed")
});
var LoggingLevelSchema = external_exports.enum([
  "debug",
  "info",
  "notice",
  "warning",
  "error",
  "critical",
  "alert",
  "emergency"
]);
var SetLevelRequestSchema = RequestSchema.extend({
  method: external_exports.literal("logging/setLevel"),
  params: BaseRequestParamsSchema.extend({
    /**
     * The level of logging that the client wants to receive from the server. The server should send all logs at this level and higher (i.e., more severe) to the client as notifications/logging/message.
     */
    level: LoggingLevelSchema
  })
});
var LoggingMessageNotificationSchema = NotificationSchema.extend({
  method: external_exports.literal("notifications/message"),
  params: BaseNotificationParamsSchema.extend({
    /**
     * The severity of this log message.
     */
    level: LoggingLevelSchema,
    /**
     * An optional name of the logger issuing this message.
     */
    logger: external_exports.optional(external_exports.string()),
    /**
     * The data to be logged, such as a string message or an object. Any JSON serializable type is allowed here.
     */
    data: external_exports.unknown()
  })
});
var ModelHintSchema = external_exports.object({
  /**
   * A hint for a model name.
   */
  name: external_exports.string().optional()
}).passthrough();
var ModelPreferencesSchema = external_exports.object({
  /**
   * Optional hints to use for model selection.
   */
  hints: external_exports.optional(external_exports.array(ModelHintSchema)),
  /**
   * How much to prioritize cost when selecting a model.
   */
  costPriority: external_exports.optional(external_exports.number().min(0).max(1)),
  /**
   * How much to prioritize sampling speed (latency) when selecting a model.
   */
  speedPriority: external_exports.optional(external_exports.number().min(0).max(1)),
  /**
   * How much to prioritize intelligence and capabilities when selecting a model.
   */
  intelligencePriority: external_exports.optional(external_exports.number().min(0).max(1))
}).passthrough();
var SamplingMessageSchema = external_exports.object({
  role: external_exports.enum(["user", "assistant"]),
  content: external_exports.union([TextContentSchema, ImageContentSchema])
}).passthrough();
var CreateMessageRequestSchema = RequestSchema.extend({
  method: external_exports.literal("sampling/createMessage"),
  params: BaseRequestParamsSchema.extend({
    messages: external_exports.array(SamplingMessageSchema),
    /**
     * An optional system prompt the server wants to use for sampling. The client MAY modify or omit this prompt.
     */
    systemPrompt: external_exports.optional(external_exports.string()),
    /**
     * A request to include context from one or more MCP servers (including the caller), to be attached to the prompt. The client MAY ignore this request.
     */
    includeContext: external_exports.optional(external_exports.enum(["none", "thisServer", "allServers"])),
    temperature: external_exports.optional(external_exports.number()),
    /**
     * The maximum number of tokens to sample, as requested by the server. The client MAY choose to sample fewer tokens than requested.
     */
    maxTokens: external_exports.number().int(),
    stopSequences: external_exports.optional(external_exports.array(external_exports.string())),
    /**
     * Optional metadata to pass through to the LLM provider. The format of this metadata is provider-specific.
     */
    metadata: external_exports.optional(external_exports.object({}).passthrough()),
    /**
     * The server's preferences for which model to select.
     */
    modelPreferences: external_exports.optional(ModelPreferencesSchema)
  })
});
var CreateMessageResultSchema = ResultSchema.extend({
  /**
   * The name of the model that generated the message.
   */
  model: external_exports.string(),
  /**
   * The reason why sampling stopped.
   */
  stopReason: external_exports.optional(external_exports.enum(["endTurn", "stopSequence", "maxTokens"]).or(external_exports.string())),
  role: external_exports.enum(["user", "assistant"]),
  content: external_exports.discriminatedUnion("type", [
    TextContentSchema,
    ImageContentSchema
  ])
});
var ResourceReferenceSchema = external_exports.object({
  type: external_exports.literal("ref/resource"),
  /**
   * The URI or URI template of the resource.
   */
  uri: external_exports.string()
}).passthrough();
var PromptReferenceSchema = external_exports.object({
  type: external_exports.literal("ref/prompt"),
  /**
   * The name of the prompt or prompt template
   */
  name: external_exports.string()
}).passthrough();
var CompleteRequestSchema = RequestSchema.extend({
  method: external_exports.literal("completion/complete"),
  params: BaseRequestParamsSchema.extend({
    ref: external_exports.union([PromptReferenceSchema, ResourceReferenceSchema]),
    /**
     * The argument's information
     */
    argument: external_exports.object({
      /**
       * The name of the argument
       */
      name: external_exports.string(),
      /**
       * The value of the argument to use for completion matching.
       */
      value: external_exports.string()
    }).passthrough()
  })
});
var CompleteResultSchema = ResultSchema.extend({
  completion: external_exports.object({
    /**
     * An array of completion values. Must not exceed 100 items.
     */
    values: external_exports.array(external_exports.string()).max(100),
    /**
     * The total number of completion options available. This can exceed the number of values actually sent in the response.
     */
    total: external_exports.optional(external_exports.number().int()),
    /**
     * Indicates whether there are additional completion options beyond those provided in the current response, even if the exact total is unknown.
     */
    hasMore: external_exports.optional(external_exports.boolean())
  }).passthrough()
});
var RootSchema = external_exports.object({
  /**
   * The URI identifying the root. This *must* start with file:// for now.
   */
  uri: external_exports.string().startsWith("file://"),
  /**
   * An optional name for the root.
   */
  name: external_exports.optional(external_exports.string())
}).passthrough();
var ListRootsRequestSchema = RequestSchema.extend({
  method: external_exports.literal("roots/list")
});
var ListRootsResultSchema = ResultSchema.extend({
  roots: external_exports.array(RootSchema)
});
var RootsListChangedNotificationSchema = NotificationSchema.extend({
  method: external_exports.literal("notifications/roots/list_changed")
});
var ClientRequestSchema = external_exports.union([
  PingRequestSchema,
  InitializeRequestSchema,
  CompleteRequestSchema,
  SetLevelRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  CallToolRequestSchema,
  ListToolsRequestSchema
]);
var ClientNotificationSchema = external_exports.union([
  CancelledNotificationSchema,
  ProgressNotificationSchema,
  InitializedNotificationSchema,
  RootsListChangedNotificationSchema
]);
var ClientResultSchema = external_exports.union([
  EmptyResultSchema,
  CreateMessageResultSchema,
  ListRootsResultSchema
]);
var ServerRequestSchema = external_exports.union([
  PingRequestSchema,
  CreateMessageRequestSchema,
  ListRootsRequestSchema
]);
var ServerNotificationSchema = external_exports.union([
  CancelledNotificationSchema,
  ProgressNotificationSchema,
  LoggingMessageNotificationSchema,
  ResourceUpdatedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
  PromptListChangedNotificationSchema
]);
var ServerResultSchema = external_exports.union([
  EmptyResultSchema,
  InitializeResultSchema,
  CompleteResultSchema,
  GetPromptResultSchema,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ReadResourceResultSchema,
  CallToolResultSchema,
  ListToolsResultSchema
]);
var McpError = class extends Error {
  constructor(code, message, data) {
    super(`MCP error ${code}: ${message}`);
    this.code = code;
    this.data = data;
  }
};

// ../../node_modules/.pnpm/@modelcontextprotocol+sdk@0.5.0/node_modules/@modelcontextprotocol/sdk/dist/shared/protocol.js
var Protocol = class {
  constructor(_options) {
    this._options = _options;
    this._requestMessageId = 0;
    this._requestHandlers = /* @__PURE__ */ new Map();
    this._requestHandlerAbortControllers = /* @__PURE__ */ new Map();
    this._notificationHandlers = /* @__PURE__ */ new Map();
    this._responseHandlers = /* @__PURE__ */ new Map();
    this._progressHandlers = /* @__PURE__ */ new Map();
    this.setNotificationHandler(CancelledNotificationSchema, (notification) => {
      const controller = this._requestHandlerAbortControllers.get(notification.params.requestId);
      controller === null || controller === void 0 ? void 0 : controller.abort(notification.params.reason);
    });
    this.setNotificationHandler(ProgressNotificationSchema, (notification) => {
      this._onprogress(notification);
    });
    this.setRequestHandler(
      PingRequestSchema,
      // Automatic pong by default.
      (_request) => ({})
    );
  }
  /**
   * Attaches to the given transport, starts it, and starts listening for messages.
   *
   * The Protocol object assumes ownership of the Transport, replacing any callbacks that have already been set, and expects that it is the only user of the Transport instance going forward.
   */
  async connect(transport) {
    this._transport = transport;
    this._transport.onclose = () => {
      this._onclose();
    };
    this._transport.onerror = (error) => {
      this._onerror(error);
    };
    this._transport.onmessage = (message) => {
      if (!("method" in message)) {
        this._onresponse(message);
      } else if ("id" in message) {
        this._onrequest(message);
      } else {
        this._onnotification(message);
      }
    };
    await this._transport.start();
  }
  _onclose() {
    var _a;
    const responseHandlers = this._responseHandlers;
    this._responseHandlers = /* @__PURE__ */ new Map();
    this._progressHandlers.clear();
    this._transport = void 0;
    (_a = this.onclose) === null || _a === void 0 ? void 0 : _a.call(this);
    const error = new McpError(ErrorCode.ConnectionClosed, "Connection closed");
    for (const handler of responseHandlers.values()) {
      handler(error);
    }
  }
  _onerror(error) {
    var _a;
    (_a = this.onerror) === null || _a === void 0 ? void 0 : _a.call(this, error);
  }
  _onnotification(notification) {
    var _a;
    const handler = (_a = this._notificationHandlers.get(notification.method)) !== null && _a !== void 0 ? _a : this.fallbackNotificationHandler;
    if (handler === void 0) {
      return;
    }
    Promise.resolve().then(() => handler(notification)).catch((error) => this._onerror(new Error(`Uncaught error in notification handler: ${error}`)));
  }
  _onrequest(request) {
    var _a, _b;
    const handler = (_a = this._requestHandlers.get(request.method)) !== null && _a !== void 0 ? _a : this.fallbackRequestHandler;
    if (handler === void 0) {
      (_b = this._transport) === null || _b === void 0 ? void 0 : _b.send({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: ErrorCode.MethodNotFound,
          message: "Method not found"
        }
      }).catch((error) => this._onerror(new Error(`Failed to send an error response: ${error}`)));
      return;
    }
    const abortController = new AbortController();
    this._requestHandlerAbortControllers.set(request.id, abortController);
    Promise.resolve().then(() => handler(request, { signal: abortController.signal })).then((result) => {
      var _a2;
      if (abortController.signal.aborted) {
        return;
      }
      return (_a2 = this._transport) === null || _a2 === void 0 ? void 0 : _a2.send({
        result,
        jsonrpc: "2.0",
        id: request.id
      });
    }, (error) => {
      var _a2, _b2;
      if (abortController.signal.aborted) {
        return;
      }
      return (_a2 = this._transport) === null || _a2 === void 0 ? void 0 : _a2.send({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: Number.isSafeInteger(error["code"]) ? error["code"] : ErrorCode.InternalError,
          message: (_b2 = error.message) !== null && _b2 !== void 0 ? _b2 : "Internal error"
        }
      });
    }).catch((error) => this._onerror(new Error(`Failed to send response: ${error}`))).finally(() => {
      this._requestHandlerAbortControllers.delete(request.id);
    });
  }
  _onprogress(notification) {
    const { progress, total, progressToken } = notification.params;
    const handler = this._progressHandlers.get(Number(progressToken));
    if (handler === void 0) {
      this._onerror(new Error(`Received a progress notification for an unknown token: ${JSON.stringify(notification)}`));
      return;
    }
    handler({ progress, total });
  }
  _onresponse(response) {
    const messageId = response.id;
    const handler = this._responseHandlers.get(Number(messageId));
    if (handler === void 0) {
      this._onerror(new Error(`Received a response for an unknown message ID: ${JSON.stringify(response)}`));
      return;
    }
    this._responseHandlers.delete(Number(messageId));
    this._progressHandlers.delete(Number(messageId));
    if ("result" in response) {
      handler(response);
    } else {
      const error = new McpError(response.error.code, response.error.message, response.error.data);
      handler(error);
    }
  }
  get transport() {
    return this._transport;
  }
  /**
   * Closes the connection.
   */
  async close() {
    var _a;
    await ((_a = this._transport) === null || _a === void 0 ? void 0 : _a.close());
  }
  /**
   * Sends a request and wait for a response.
   *
   * Do not use this method to emit notifications! Use notification() instead.
   */
  request(request, resultSchema, options) {
    return new Promise((resolve4, reject) => {
      var _a, _b, _c;
      if (!this._transport) {
        reject(new Error("Not connected"));
        return;
      }
      if (((_a = this._options) === null || _a === void 0 ? void 0 : _a.enforceStrictCapabilities) === true) {
        this.assertCapabilityForMethod(request.method);
      }
      (_b = options === null || options === void 0 ? void 0 : options.signal) === null || _b === void 0 ? void 0 : _b.throwIfAborted();
      const messageId = this._requestMessageId++;
      const jsonrpcRequest = {
        ...request,
        jsonrpc: "2.0",
        id: messageId
      };
      if (options === null || options === void 0 ? void 0 : options.onprogress) {
        this._progressHandlers.set(messageId, options.onprogress);
        jsonrpcRequest.params = {
          ...request.params,
          _meta: { progressToken: messageId }
        };
      }
      this._responseHandlers.set(messageId, (response) => {
        var _a2;
        if ((_a2 = options === null || options === void 0 ? void 0 : options.signal) === null || _a2 === void 0 ? void 0 : _a2.aborted) {
          return;
        }
        if (response instanceof Error) {
          return reject(response);
        }
        try {
          const result = resultSchema.parse(response.result);
          resolve4(result);
        } catch (error) {
          reject(error);
        }
      });
      (_c = options === null || options === void 0 ? void 0 : options.signal) === null || _c === void 0 ? void 0 : _c.addEventListener("abort", () => {
        var _a2, _b2;
        const reason = (_a2 = options === null || options === void 0 ? void 0 : options.signal) === null || _a2 === void 0 ? void 0 : _a2.reason;
        this._responseHandlers.delete(messageId);
        this._progressHandlers.delete(messageId);
        (_b2 = this._transport) === null || _b2 === void 0 ? void 0 : _b2.send({
          jsonrpc: "2.0",
          method: "cancelled",
          params: {
            requestId: messageId,
            reason: String(reason)
          }
        });
        reject(reason);
      });
      this._transport.send(jsonrpcRequest).catch(reject);
    });
  }
  /**
   * Emits a notification, which is a one-way message that does not expect a response.
   */
  async notification(notification) {
    if (!this._transport) {
      throw new Error("Not connected");
    }
    this.assertNotificationCapability(notification.method);
    const jsonrpcNotification = {
      ...notification,
      jsonrpc: "2.0"
    };
    await this._transport.send(jsonrpcNotification);
  }
  /**
   * Registers a handler to invoke when this protocol object receives a request with the given method.
   *
   * Note that this will replace any previous request handler for the same method.
   */
  setRequestHandler(requestSchema, handler) {
    const method = requestSchema.shape.method.value;
    this.assertRequestHandlerCapability(method);
    this._requestHandlers.set(method, (request, extra) => Promise.resolve(handler(requestSchema.parse(request), extra)));
  }
  /**
   * Removes the request handler for the given method.
   */
  removeRequestHandler(method) {
    this._requestHandlers.delete(method);
  }
  /**
   * Registers a handler to invoke when this protocol object receives a notification with the given method.
   *
   * Note that this will replace any previous notification handler for the same method.
   */
  setNotificationHandler(notificationSchema, handler) {
    this._notificationHandlers.set(notificationSchema.shape.method.value, (notification) => Promise.resolve(handler(notificationSchema.parse(notification))));
  }
  /**
   * Removes the notification handler for the given method.
   */
  removeNotificationHandler(method) {
    this._notificationHandlers.delete(method);
  }
};

// ../../node_modules/.pnpm/@modelcontextprotocol+sdk@0.5.0/node_modules/@modelcontextprotocol/sdk/dist/server/index.js
var Server = class extends Protocol {
  /**
   * Initializes this server with the given name and version information.
   */
  constructor(_serverInfo, options) {
    super(options);
    this._serverInfo = _serverInfo;
    this._capabilities = options.capabilities;
    this.setRequestHandler(InitializeRequestSchema, (request) => this._oninitialize(request));
    this.setNotificationHandler(InitializedNotificationSchema, () => {
      var _a;
      return (_a = this.oninitialized) === null || _a === void 0 ? void 0 : _a.call(this);
    });
  }
  assertCapabilityForMethod(method) {
    var _a, _b;
    switch (method) {
      case "sampling/createMessage":
        if (!((_a = this._clientCapabilities) === null || _a === void 0 ? void 0 : _a.sampling)) {
          throw new Error(`Client does not support sampling (required for ${method})`);
        }
        break;
      case "roots/list":
        if (!((_b = this._clientCapabilities) === null || _b === void 0 ? void 0 : _b.roots)) {
          throw new Error(`Client does not support listing roots (required for ${method})`);
        }
        break;
      case "ping":
        break;
    }
  }
  assertNotificationCapability(method) {
    switch (method) {
      case "notifications/message":
        if (!this._capabilities.logging) {
          throw new Error(`Server does not support logging (required for ${method})`);
        }
        break;
      case "notifications/resources/updated":
      case "notifications/resources/list_changed":
        if (!this._capabilities.resources) {
          throw new Error(`Server does not support notifying about resources (required for ${method})`);
        }
        break;
      case "notifications/tools/list_changed":
        if (!this._capabilities.tools) {
          throw new Error(`Server does not support notifying of tool list changes (required for ${method})`);
        }
        break;
      case "notifications/prompts/list_changed":
        if (!this._capabilities.prompts) {
          throw new Error(`Server does not support notifying of prompt list changes (required for ${method})`);
        }
        break;
      case "notifications/cancelled":
        break;
      case "notifications/progress":
        break;
    }
  }
  assertRequestHandlerCapability(method) {
    switch (method) {
      case "sampling/createMessage":
        if (!this._capabilities.sampling) {
          throw new Error(`Server does not support sampling (required for ${method})`);
        }
        break;
      case "logging/setLevel":
        if (!this._capabilities.logging) {
          throw new Error(`Server does not support logging (required for ${method})`);
        }
        break;
      case "prompts/get":
      case "prompts/list":
        if (!this._capabilities.prompts) {
          throw new Error(`Server does not support prompts (required for ${method})`);
        }
        break;
      case "resources/list":
      case "resources/templates/list":
      case "resources/read":
        if (!this._capabilities.resources) {
          throw new Error(`Server does not support resources (required for ${method})`);
        }
        break;
      case "tools/call":
      case "tools/list":
        if (!this._capabilities.tools) {
          throw new Error(`Server does not support tools (required for ${method})`);
        }
        break;
      case "ping":
      case "initialize":
        break;
    }
  }
  async _oninitialize(request) {
    const requestedVersion = request.params.protocolVersion;
    this._clientCapabilities = request.params.capabilities;
    this._clientVersion = request.params.clientInfo;
    return {
      protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion) ? requestedVersion : LATEST_PROTOCOL_VERSION,
      capabilities: this.getCapabilities(),
      serverInfo: this._serverInfo
    };
  }
  /**
   * After initialization has completed, this will be populated with the client's reported capabilities.
   */
  getClientCapabilities() {
    return this._clientCapabilities;
  }
  /**
   * After initialization has completed, this will be populated with information about the client's name and version.
   */
  getClientVersion() {
    return this._clientVersion;
  }
  getCapabilities() {
    return this._capabilities;
  }
  async ping() {
    return this.request({ method: "ping" }, EmptyResultSchema);
  }
  async createMessage(params, options) {
    return this.request({ method: "sampling/createMessage", params }, CreateMessageResultSchema, options);
  }
  async listRoots(params, options) {
    return this.request({ method: "roots/list", params }, ListRootsResultSchema, options);
  }
  async sendLoggingMessage(params) {
    return this.notification({ method: "notifications/message", params });
  }
  async sendResourceUpdated(params) {
    return this.notification({
      method: "notifications/resources/updated",
      params
    });
  }
  async sendResourceListChanged() {
    return this.notification({
      method: "notifications/resources/list_changed"
    });
  }
  async sendToolListChanged() {
    return this.notification({ method: "notifications/tools/list_changed" });
  }
  async sendPromptListChanged() {
    return this.notification({ method: "notifications/prompts/list_changed" });
  }
};

// ../../node_modules/.pnpm/@modelcontextprotocol+sdk@0.5.0/node_modules/@modelcontextprotocol/sdk/dist/server/stdio.js
import process2 from "node:process";

// ../../node_modules/.pnpm/@modelcontextprotocol+sdk@0.5.0/node_modules/@modelcontextprotocol/sdk/dist/shared/stdio.js
var ReadBuffer = class {
  append(chunk) {
    this._buffer = this._buffer ? Buffer.concat([this._buffer, chunk]) : chunk;
  }
  readMessage() {
    if (!this._buffer) {
      return null;
    }
    const index = this._buffer.indexOf("\n");
    if (index === -1) {
      return null;
    }
    const line = this._buffer.toString("utf8", 0, index);
    this._buffer = this._buffer.subarray(index + 1);
    return deserializeMessage(line);
  }
  clear() {
    this._buffer = void 0;
  }
};
function deserializeMessage(line) {
  return JSONRPCMessageSchema.parse(JSON.parse(line));
}
function serializeMessage(message) {
  return JSON.stringify(message) + "\n";
}

// ../../node_modules/.pnpm/@modelcontextprotocol+sdk@0.5.0/node_modules/@modelcontextprotocol/sdk/dist/server/stdio.js
var StdioServerTransport = class {
  constructor(_stdin = process2.stdin, _stdout = process2.stdout) {
    this._stdin = _stdin;
    this._stdout = _stdout;
    this._readBuffer = new ReadBuffer();
    this._started = false;
    this._ondata = (chunk) => {
      this._readBuffer.append(chunk);
      this.processReadBuffer();
    };
    this._onerror = (error) => {
      var _a;
      (_a = this.onerror) === null || _a === void 0 ? void 0 : _a.call(this, error);
    };
  }
  /**
   * Starts listening for messages on stdin.
   */
  async start() {
    if (this._started) {
      throw new Error("StdioServerTransport already started! If using Server class, note that connect() calls start() automatically.");
    }
    this._started = true;
    this._stdin.on("data", this._ondata);
    this._stdin.on("error", this._onerror);
  }
  processReadBuffer() {
    var _a, _b;
    while (true) {
      try {
        const message = this._readBuffer.readMessage();
        if (message === null) {
          break;
        }
        (_a = this.onmessage) === null || _a === void 0 ? void 0 : _a.call(this, message);
      } catch (error) {
        (_b = this.onerror) === null || _b === void 0 ? void 0 : _b.call(this, error);
      }
    }
  }
  async close() {
    var _a;
    this._stdin.off("data", this._ondata);
    this._stdin.off("error", this._onerror);
    this._readBuffer.clear();
    (_a = this.onclose) === null || _a === void 0 ? void 0 : _a.call(this);
  }
  send(message) {
    return new Promise((resolve4) => {
      const json2 = serializeMessage(message);
      if (this._stdout.write(json2)) {
        resolve4();
      } else {
        this._stdout.once("drain", resolve4);
      }
    });
  }
};

// src/index.ts
import { join as join9 } from "path";
import { EventEmitter as EventEmitter3 } from "events";
import { watch } from "fs";

// ../shared/dist/analytics-service.js
var AnalyticsService = class {
  static filterTickets(tickets, filters) {
    let filtered = [...tickets];
    if (filters.features && filters.features.length > 0) {
      filtered = filtered.filter((t) => filters.features.includes(t.feature));
    }
    if (filters.assignees && filters.assignees.length > 0) {
      filtered = filtered.filter((t) => filters.assignees.includes(t.assignee));
    }
    if (filters.types && filters.types.length > 0) {
      filtered = filtered.filter((t) => filters.types.includes(t.type));
    }
    if (filters.timeRange) {
      const start = new Date(filters.timeRange.start);
      const end = new Date(filters.timeRange.end);
      filtered = filtered.filter((t) => {
        const created = new Date(t.created);
        return created >= start && created <= end;
      });
    }
    return filtered;
  }
  static generateTimeTrackingReport(tickets) {
    const agentData = /* @__PURE__ */ new Map();
    const ticketsWorkedByAgent = /* @__PURE__ */ new Map();
    tickets.forEach((ticket) => {
      if (ticket.work_sessions) {
        ticket.work_sessions.forEach((session) => {
          const agent = session.agent;
          if (!agentData.has(agent)) {
            agentData.set(agent, {
              agent,
              sessions: 0,
              totalMinutes: 0,
              totalTokens: 0,
              averageSessionMinutes: 0,
              ticketsWorked: 0,
              totalCostUsd: 0,
              costByModel: {},
              quarantinedSessions: 0
            });
            ticketsWorkedByAgent.set(agent, /* @__PURE__ */ new Set());
          }
          const data = agentData.get(agent);
          if (session.quarantined) {
            data.quarantinedSessions++;
            return;
          }
          data.sessions++;
          if (session.duration) {
            const [hours, minutes] = session.duration.split(":").map(Number);
            data.totalMinutes += hours * 60 + minutes;
          }
          if (session.tokens) {
            data.totalTokens += session.tokens;
          }
          data.totalCostUsd += session.cost_usd ?? 0;
          if (session.cost_by_model) {
            for (const [model, cost] of Object.entries(session.cost_by_model)) {
              data.costByModel[model] = (data.costByModel[model] ?? 0) + cost;
            }
          }
          ticketsWorkedByAgent.get(agent).add(ticket.ticket_number);
        });
      }
    });
    agentData.forEach((data, agent) => {
      data.averageSessionMinutes = data.sessions > 0 ? Math.round(data.totalMinutes / data.sessions) : 0;
      data.ticketsWorked = ticketsWorkedByAgent.get(agent).size;
    });
    return Array.from(agentData.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }
  /**
   * Spend per feature.
   *
   * The one metric that is genuinely about AI-assisted development rather than
   * inherited from human sprint management. Reported in dollars, not tokens,
   * because cache_read is billed at roughly a tenth of fresh input — cacheReadRatio
   * keeps that visible.
   *
   * Caveat for the UI: each session's first turn re-reads the whole conversation
   * context, so a ticket worked late in a long conversation carries more
   * context-read cost than the same ticket worked early. Read this as cost
   * in situ, not intrinsic difficulty.
   */
  static generateCostReport(tickets) {
    const byFeature = /* @__PURE__ */ new Map();
    tickets.forEach((ticket) => {
      const sessions = (ticket.work_sessions ?? []).filter((s) => !s.quarantined);
      if (sessions.length === 0)
        return;
      if (!byFeature.has(ticket.feature)) {
        byFeature.set(ticket.feature, {
          feature: ticket.feature,
          tickets: 0,
          sessions: 0,
          costUsd: 0,
          costByModel: {},
          tokens: 0,
          cacheReadRatio: 0,
          _input: 0,
          _cacheRead: 0
        });
      }
      const data = byFeature.get(ticket.feature);
      data.tickets++;
      sessions.forEach((session) => {
        data.sessions++;
        data.costUsd += session.cost_usd ?? 0;
        data.tokens += session.tokens ?? 0;
        if (session.cost_by_model) {
          for (const [model, cost] of Object.entries(session.cost_by_model)) {
            data.costByModel[model] = (data.costByModel[model] ?? 0) + cost;
          }
        }
        if (session.token_breakdown) {
          data._input += session.token_breakdown.input;
          data._cacheRead += session.token_breakdown.cache_read;
        }
      });
    });
    return Array.from(byFeature.values()).map(({ _input, _cacheRead, ...rest }) => ({
      ...rest,
      cacheReadRatio: _input > 0 ? _cacheRead / _input : 0
    })).sort((a, b) => b.costUsd - a.costUsd);
  }
  /**
   * Rounds of work per ticket.
   *
   * A work session brackets one reply (#262), so several sessions on a ticket
   * means it came back — under-specified ticket, or a hard area of the
   * codebase. #141 needed 11 rounds fighting a Docker build; #235 needed 2,
   * the second triggered by review feedback.
   */
  static generateReworkReport(tickets) {
    return tickets.map((ticket) => {
      const sessions = (ticket.work_sessions ?? []).filter((s) => !s.quarantined);
      return {
        ticketNumber: ticket.ticket_number,
        title: ticket.title,
        feature: ticket.feature,
        sessions: sessions.length,
        reworked: sessions.length > 1,
        costUsd: sessions.reduce((sum, s) => sum + (s.cost_usd ?? 0), 0)
      };
    }).filter((r) => r.sessions > 0).sort((a, b) => b.sessions - a.sessions || a.ticketNumber - b.ticketNumber);
  }
  static generateFeatureProgressReport(tickets) {
    const featureData = /* @__PURE__ */ new Map();
    tickets.forEach((ticket) => {
      if (!featureData.has(ticket.feature)) {
        featureData.set(ticket.feature, {
          feature: ticket.feature,
          total: 0,
          todo: 0,
          inProgress: 0,
          done: 0,
          completionPercentage: 0,
          totalWorkMinutes: 0,
          assignees: []
        });
      }
      const data = featureData.get(ticket.feature);
      data.total++;
      data.totalWorkMinutes += ticket.time_spent_minutes;
      if (ticket.assignee && !data.assignees.includes(ticket.assignee)) {
        data.assignees.push(ticket.assignee);
      }
      switch (ticket.status) {
        case "todo":
          data.todo++;
          break;
        case "in-progress":
          data.inProgress++;
          break;
        case "done":
          data.done++;
          break;
      }
    });
    featureData.forEach((data) => {
      data.completionPercentage = data.total > 0 ? Math.round(data.done / data.total * 100) : 0;
    });
    return Array.from(featureData.values()).sort((a, b) => b.total - a.total);
  }
};

// ../shared/dist/session-cost.js
function summariseSessionCost(prompts) {
  const summary = {
    cost_usd: 0,
    cost_by_model: {},
    token_breakdown: { input: 0, output: 0, cache_creation: 0, cache_read: 0 }
  };
  for (const p of prompts ?? []) {
    const cost = typeof p.cost_usd === "number" ? p.cost_usd : 0;
    summary.cost_usd += cost;
    if (cost > 0 && p.model) {
      summary.cost_by_model[p.model] = (summary.cost_by_model[p.model] ?? 0) + cost;
    }
    const t = p.tokens;
    if (t) {
      summary.token_breakdown.input += t.input ?? 0;
      summary.token_breakdown.output += t.output ?? 0;
      summary.token_breakdown.cache_creation += t.cache_creation ?? 0;
      summary.token_breakdown.cache_read += t.cache_read ?? 0;
    }
  }
  return summary;
}

// ../shared/dist/utils.js
import { promises as fs, readFileSync as readFileSync2, unlinkSync as unlinkSync2 } from "fs";
import { AsyncLocalStorage } from "async_hooks";
import { createHash, randomBytes as randomBytes2, randomUUID } from "crypto";
import { hostname } from "os";
import * as path3 from "path";

// ../../node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing;
var isObject_1 = isObject;
var toArray_1 = toArray;
var repeat_1 = repeat;
var isNegativeZero_1 = isNegativeZero;
var extend_1 = extend;
var common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function toString(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i2, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i2 = 1; i2 <= options.linesBefore; i2++) {
    if (foundLineNo - i2 < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i2],
      lineEnds[foundLineNo - i2],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i2]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i2 + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i2 = 1; i2 <= options.linesAfter; i2++) {
    if (foundLineNo + i2 >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i2],
      lineEnds[foundLineNo + i2],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i2]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i2 + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet;
var TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
];
var YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function extend2(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof type) {
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  }
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
    if (type$1.loadKind && type$1.loadKind !== "scalar") {
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    }
    if (type$1.multi) {
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }
  });
  explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
  });
  var result = Object.create(Schema$1.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, "implicit");
  result.compiledExplicit = compileList(result, "explicit");
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
var schema = Schema$1;
var str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
});
var seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
});
var map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
});
var failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
});
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
});
var json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
});
var core = json;
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});
var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
var _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});
var _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});
var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
});
var _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
});
var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
var i;
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      throwError(state, "YAML directive accepts exactly one argument");
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, "ill-formed argument of the YAML directive");
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, "TAG directive accepts exactly two arguments");
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    }
    if (_hasOwnProperty$1.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      destination[key] = source[key];
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    if (keyNode === "__proto__") {
      Object.defineProperty(_result, keyNode, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: valueNode
      });
    } else {
      _result[keyNode] = valueNode;
    }
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
var loadAll_1 = loadAll$1;
var load_1 = load$1;
var loader = {
  loadAll: loadAll_1,
  load: load_1
};
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 65279;
var CHAR_TAB = 9;
var CHAR_LINE_FEED = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_EXCLAMATION = 33;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SHARP = 35;
var CHAR_PERCENT = 37;
var CHAR_AMPERSAND = 38;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_MINUS = 45;
var CHAR_COLON = 58;
var CHAR_EQUALS = 61;
var CHAR_GREATER_THAN = 62;
var CHAR_QUESTION = 63;
var CHAR_COMMERCIAL_AT = 64;
var CHAR_LEFT_SQUARE_BRACKET = 91;
var CHAR_RIGHT_SQUARE_BRACKET = 93;
var CHAR_GRAVE_ACCENT = 96;
var CHAR_LEFT_CURLY_BRACKET = 123;
var CHAR_VERTICAL_LINE = 124;
var CHAR_RIGHT_CURLY_BRACKET = 125;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1;
var QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1;
var STYLE_SINGLE = 2;
var STYLE_LITERAL = 3;
var STYLE_FOLDED = 4;
var STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i2;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i2 = 0; i2 < string.length; char >= 65536 ? i2 += 2 : i2++) {
      char = codePointAt(string, i2);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i2 = 0; i2 < string.length; char >= 65536 ? i2 += 2 : i2++) {
      char = codePointAt(string, i2);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i2 - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i2;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i2 - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = (function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  })();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = (function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  })();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i2 = 0; i2 < string.length; char >= 65536 ? i2 += 2 : i2++) {
    char = codePointAt(string, i2);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i2];
      if (char >= 65536) result += string[i2 + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
var dump_1 = dump$1;
var dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var load = loader.load;
var loadAll = loader.loadAll;
var dump = dumper.dump;
var safeLoad = renamed("safeLoad", "load");
var safeLoadAll = renamed("safeLoadAll", "loadAll");
var safeDump = renamed("safeDump", "dump");

// ../shared/dist/constants.js
var TICKET_STATUSES = ["todo", "in-progress", "done"];
var TICKET_PRIORITIES = ["critical", "high", "medium", "low"];
var TICKET_TYPES = ["bug", "task", "story", "spike"];
var STEP_STATUSES = ["pending", "done", "skipped"];
function isValidTicketStatus(status) {
  return TICKET_STATUSES.includes(status);
}
function isValidTicketPriority(priority) {
  return TICKET_PRIORITIES.includes(priority);
}
function isValidTicketType(type2) {
  return TICKET_TYPES.includes(type2);
}
function getValidStatusesString() {
  return TICKET_STATUSES.join(", ");
}
function getValidPrioritiesString() {
  return TICKET_PRIORITIES.join(", ");
}
function getValidTypesString() {
  return TICKET_TYPES.join(", ");
}
function isValidStepStatus(status) {
  return STEP_STATUSES.includes(status);
}
function validateTicketProperties(properties) {
  const errors = [];
  if (properties.status !== void 0 && !isValidTicketStatus(properties.status)) {
    errors.push(`Invalid status: ${properties.status}. Valid values: ${getValidStatusesString()}`);
  }
  if (properties.priority !== void 0 && !isValidTicketPriority(properties.priority)) {
    errors.push(`Invalid priority: ${properties.priority}. Valid values: ${getValidPrioritiesString()}`);
  }
  if (properties.type !== void 0 && !isValidTicketType(properties.type)) {
    errors.push(`Invalid type: ${properties.type}. Valid values: ${getValidTypesString()}`);
  }
  return {
    isValid: errors.length === 0,
    errors
  };
}

// ../shared/dist/ticket-index.js
import { readFileSync, readdirSync, statSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import * as path2 from "node:path";

// ../shared/dist/layout.js
import path from "path";
var TICKETS_DIR = "tickets";
function ticketRelPath(filename) {
  return path.join(TICKETS_DIR, filename);
}
function isTicketFilename(name) {
  return name.startsWith("ticket-") && name.endsWith(".yaml");
}

// ../shared/dist/ticket-index.js
var INDEX_FILENAME = ".index.json";
var SNAPSHOT_VERSION = 2;
var sameFile = (a, b) => a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino;
var memos = /* @__PURE__ */ new Map();
function snapshotStamp(file) {
  try {
    const st = statSync(file);
    return `${st.size}:${st.mtimeMs}:${st.ino}`;
  } catch {
    return null;
  }
}
var TicketIndex = class {
  dataDir;
  snapshotPath;
  memoKey;
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.snapshotPath = path2.join(dataDir, INDEX_FILENAME);
    this.memoKey = path2.resolve(dataDir);
  }
  /**
   * Every ticket in the corpus, optionally narrowed to one status.
   *
   * The returned tickets are the index's own objects, shared between callers
   * and reused across reads: treat them as read-only. Callers that mutate a
   * ticket must take an owned copy — `TrackerFileSystem.readTicket` does.
   */
  async readAll(status) {
    return (await this.readAllEntries(status)).map((e) => e.ticket);
  }
  /**
   * As `readAll`, but pairs each ticket with its path relative to the data
   * dir, for callers that report on file locations. Sorted by path so output
   * built from it is stable across runs, matching `findTickets`.
   */
  async readAllEntries(status) {
    const entries = this.revalidate();
    const out = [];
    for (const entry of entries.values()) {
      if (status && entry.ticket.status !== status)
        continue;
      out.push({ path: entry.path, ticket: entry.ticket });
    }
    return out.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  }
  /**
   * One ticket by its path relative to the data dir, or null if it is gone.
   * Shares the same read-only contract as `readAll`.
   */
  async readOne(relPath) {
    const entries = this.revalidate();
    const entry = entries.get(relPath);
    return entry ? entry.ticket : null;
  }
  /**
   * A single ticket from the cache, without sweeping the corpus, or null.
   *
   * Deliberately narrower than `readAll`: it stats one file and compares one
   * fingerprint, which is the same staleness guarantee applied to the only
   * file the caller asked about. It never populates the cache and never falls
   * back to parsing, so a single-ticket read can only get faster — sweeping
   * 327 files to answer a question about one of them would be a regression.
   */
  peek(relPath) {
    const memo = memos.get(this.memoKey);
    if (!memo)
      return null;
    const cached = memo.entries.get(relPath);
    if (!cached)
      return null;
    try {
      const st = statSync(path2.join(this.dataDir, relPath));
      if (!sameFile({ path: relPath, size: st.size, mtimeMs: st.mtimeMs, ino: st.ino }, cached)) {
        return null;
      }
    } catch {
      return null;
    }
    return cached.ticket;
  }
  /** The path of a ticket file by number, relative to the data dir. */
  async findPath(ticketNumber) {
    const entries = this.revalidate();
    for (const entry of entries.values()) {
      if (entry.ticket?.ticket_number === ticketNumber)
        return entry.path;
    }
    return null;
  }
  /**
   * Brings the in-memory index in line with what is on disk right now, and
   * returns it. This is the whole correctness story, so it runs on every read.
   */
  revalidate() {
    const memo = this.loadMemo();
    const stamps = this.sweep();
    const next = /* @__PURE__ */ new Map();
    let changed = false;
    for (const stamp of stamps) {
      const cached = memo.entries.get(stamp.path);
      if (cached && sameFile(stamp, cached)) {
        next.set(stamp.path, cached);
        continue;
      }
      const parsed = this.parse(stamp);
      if (parsed) {
        next.set(stamp.path, parsed);
        changed = true;
      }
    }
    if (next.size !== memo.entries.size)
      changed = true;
    memo.entries = next;
    if (changed)
      this.persist(memo);
    return next;
  }
  /**
   * Enumerates every ticket file and stats it. Deliberately reads the ticket
   * files themselves and never the feature rollups: the rollups are derived
   * too, and in the live corpus several disagree with the tickets on disk
   * (#338). The files are the truth.
   */
  sweep() {
    const stamps = [];
    let files;
    try {
      files = readdirSync(path2.join(this.dataDir, TICKETS_DIR), { withFileTypes: true });
    } catch {
      return stamps;
    }
    for (const file of files) {
      if (file.isDirectory())
        continue;
      if (!isTicketFilename(file.name))
        continue;
      const rel = ticketRelPath(file.name);
      try {
        const st = statSync(path2.join(this.dataDir, rel));
        stamps.push({ path: rel, size: st.size, mtimeMs: st.mtimeMs, ino: st.ino });
      } catch {
      }
    }
    return stamps;
  }
  /** Reads and parses one ticket file. Returns null if it is unreadable. */
  parse(stamp) {
    try {
      const raw = readFileSync(path2.join(this.dataDir, stamp.path), "utf-8");
      const ticket = load(raw);
      if (!ticket || typeof ticket !== "object")
        return null;
      if (!ticket.last_updated)
        ticket.last_updated = ticket.created;
      return { path: stamp.path, size: stamp.size, mtimeMs: stamp.mtimeMs, ino: stamp.ino, ticket };
    } catch {
      return null;
    }
  }
  /** Loads the memo, re-reading the snapshot if it changed underneath us. */
  loadMemo() {
    let memo = memos.get(this.memoKey);
    const stamp = snapshotStamp(this.snapshotPath);
    if (memo && memo.snapshotStamp === stamp)
      return memo;
    memo = { entries: this.readSnapshot(), snapshotStamp: stamp };
    memos.set(this.memoKey, memo);
    return memo;
  }
  /** Reads the snapshot. Any problem at all means "start from nothing". */
  readSnapshot() {
    const entries = /* @__PURE__ */ new Map();
    try {
      const snap = JSON.parse(readFileSync(this.snapshotPath, "utf-8"));
      if (!snap || snap.version !== SNAPSHOT_VERSION || !Array.isArray(snap.entries))
        return entries;
      for (const entry of snap.entries) {
        if (!entry || typeof entry.path !== "string" || !entry.ticket)
          continue;
        entries.set(entry.path, entry);
      }
    } catch {
    }
    return entries;
  }
  /**
   * Writes the snapshot, atomically, and never fatally.
   *
   * tmp-then-rename so a concurrent reader cannot see a half-written snapshot,
   * with the temp name matching the pattern TrackerFileSystem already sweeps.
   * No fsync: this is a rebuildable cache, and paying for durability on
   * something we would happily delete is the wrong trade.
   *
   * Failure is swallowed by design — a read-only or full data dir must still
   * serve correct reads, just without the speedup.
   */
  persist(memo) {
    const snapshot = { version: SNAPSHOT_VERSION, entries: [...memo.entries.values()] };
    const tmp = path2.join(this.dataDir, `.${INDEX_FILENAME}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
    try {
      writeFileSync(tmp, JSON.stringify(snapshot), "utf-8");
      renameSync(tmp, this.snapshotPath);
      memo.snapshotStamp = snapshotStamp(this.snapshotPath);
    } catch {
      try {
        unlinkSync(tmp);
      } catch {
      }
      memo.snapshotStamp = snapshotStamp(this.snapshotPath);
    }
  }
};

// ../shared/dist/utils.js
var SILENT_LOGGER = () => {
};
async function writeFileAtomic(requestedTarget, content, dataDir) {
  const target = await resolveWriteTarget(requestedTarget, dataDir);
  const dir = path3.dirname(target);
  const tmpPath = path3.join(dir, `.${path3.basename(target)}.${process.pid}.${randomBytes2(6).toString("hex")}.tmp`);
  let handle;
  try {
    handle = await fs.open(tmpPath, "wx", 438);
    await handle.writeFile(content, "utf-8");
    const existingMode = await fs.stat(target).then((stats) => stats.mode, () => void 0);
    if (existingMode !== void 0) {
      await handle.chmod(existingMode);
    }
    await handle.sync();
    await handle.close();
    handle = void 0;
    await fs.rename(tmpPath, target);
    const dirHandle = await fs.open(dir, "r").catch(() => null);
    if (dirHandle) {
      await dirHandle.sync().catch(() => {
      });
      await dirHandle.close().catch(() => {
      });
    }
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {
      });
    }
    await fs.unlink(tmpPath).catch(() => {
    });
    throw error;
  }
}
var TEMP_FILE_PATTERN = /^\..+\.\d+\.[0-9a-f]{12}\.tmp$/;
var TEMP_SWEEP_AGE_MS = 6e4;
var MAX_SYMLINK_HOPS = 16;
async function resolveWriteTarget(target, dataDir) {
  let resolved = target;
  for (let hop = 0; hop < MAX_SYMLINK_HOPS; hop++) {
    let stats;
    try {
      stats = await fs.lstat(resolved);
    } catch {
      break;
    }
    if (!stats.isSymbolicLink())
      break;
    const linked = await fs.readlink(resolved);
    resolved = path3.resolve(path3.dirname(resolved), linked);
  }
  await assertInsideDataDir(resolved, dataDir);
  return resolved;
}
var realDataDirs = /* @__PURE__ */ new Map();
async function assertInsideDataDir(resolved, dataDir) {
  let realRoot = realDataDirs.get(dataDir);
  if (realRoot === void 0) {
    realRoot = await fs.realpath(dataDir).catch(() => path3.resolve(dataDir));
    realDataDirs.set(dataDir, realRoot);
  }
  const realParent = await fs.realpath(path3.dirname(resolved)).catch(() => path3.resolve(path3.dirname(resolved)));
  const finalPath = path3.join(realParent, path3.basename(resolved));
  if (finalPath !== realRoot && !finalPath.startsWith(realRoot + path3.sep)) {
    throw new Error(`Refusing to write to ${finalPath}: it resolves outside the tracker data directory ${realRoot}. A symlink in the store points out of it.`);
  }
}
var LOCK_FILENAME = ".tracker-write.lock";
var LOCK_STAGE_SUFFIX = ".stage-";
var LOCK_STALE_MS = 1e4;
var LOCK_REFRESH_MS = 2e3;
var LOCK_ACQUIRE_TIMEOUT_MS = 3e4;
var LOCK_POLL_MIN_MS = 2;
var LOCK_POLL_MAX_MS = 25;
var inProcessLocks = /* @__PURE__ */ new Map();
function delay(ms) {
  return new Promise((resolve4) => setTimeout(resolve4, ms));
}
async function withInProcessLock(key, fn) {
  const previous = inProcessLocks.get(key) ?? Promise.resolve();
  const mine = previous.catch(() => {
  }).then(fn);
  const queued = mine.then(() => {
  }, () => {
  });
  inProcessLocks.set(key, queued);
  try {
    return await mine;
  } finally {
    if (inProcessLocks.get(key) === queued) {
      inProcessLocks.delete(key);
    }
  }
}
async function staleLockContent(lockPath) {
  let stats;
  try {
    stats = await fs.stat(lockPath);
  } catch {
    return null;
  }
  const raw = await fs.readFile(lockPath, "utf-8").catch(() => null);
  if (raw === null)
    return null;
  if (Date.now() - stats.mtimeMs > LOCK_STALE_MS)
    return raw;
  try {
    const owner = JSON.parse(raw);
    if (owner.host === lockHostname() && typeof owner.pid === "number" && owner.pid !== process.pid && !isProcessAlive(owner.pid)) {
      return raw;
    }
  } catch {
  }
  return null;
}
function breakerPathFor(lockPath, raw) {
  const fingerprint = createHash("sha256").update(raw).digest("hex").slice(0, 16);
  return `${lockPath}.break-${fingerprint}`;
}
async function breakStaleLock(lockPath, raw) {
  const breakerPath = breakerPathFor(lockPath, raw);
  try {
    const handle = await fs.open(breakerPath, "wx", 420);
    await handle.close();
  } catch (error) {
    if (error?.code !== "EEXIST")
      return;
    const stats = await fs.stat(breakerPath).catch(() => null);
    if (stats && Date.now() - stats.mtimeMs > LOCK_STALE_MS) {
      await fs.unlink(breakerPath).catch(() => {
      });
    }
    return;
  }
  try {
    if (await staleLockContent(lockPath) === raw) {
      await fs.unlink(lockPath).catch(() => {
      });
    }
  } finally {
    await fs.unlink(breakerPath).catch(() => {
    });
  }
}
async function releaseLock(lockPath, body) {
  const raw = await fs.readFile(lockPath, "utf-8").catch(() => null);
  if (raw === body) {
    await fs.unlink(lockPath).catch(() => {
    });
  }
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}
var cachedHostname;
function lockHostname() {
  if (cachedHostname === void 0) {
    try {
      cachedHostname = hostname();
    } catch {
      cachedHostname = "";
    }
  }
  return cachedHostname;
}
var heldLocks = /* @__PURE__ */ new Map();
var lockCleanupInstalled = false;
function releaseHeldLocksSync() {
  for (const [lockPath, body] of heldLocks) {
    try {
      if (readFileSync2(lockPath, "utf-8") === body) {
        unlinkSync2(lockPath);
      }
    } catch {
    }
  }
  heldLocks.clear();
}
function installLockCleanup() {
  if (lockCleanupInstalled)
    return;
  lockCleanupInstalled = true;
  process.once("exit", releaseHeldLocksSync);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(signal, () => {
      releaseHeldLocksSync();
      if (process.listenerCount(signal) === 0) {
        process.kill(process.pid, signal);
      }
    });
  }
}
async function withFileLock(dataDir, fn) {
  const lockPath = path3.join(dataDir, LOCK_FILENAME);
  const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
  let poll = LOCK_POLL_MIN_MS;
  let body = "";
  installLockCleanup();
  for (; ; ) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${LOCK_ACQUIRE_TIMEOUT_MS}ms waiting for the tracker write lock at ${lockPath}. Another process is holding it. Remove the file if you are certain nothing is writing.`);
    }
    body = JSON.stringify({
      token: randomUUID(),
      pid: process.pid,
      host: lockHostname(),
      acquired: (/* @__PURE__ */ new Date()).toISOString()
    });
    const staging = `${lockPath}${LOCK_STAGE_SUFFIX}${randomUUID()}`;
    let claimed = false;
    try {
      await fs.writeFile(staging, body, { flag: "wx", mode: 420 });
      heldLocks.set(lockPath, body);
      try {
        await fs.link(staging, lockPath);
        claimed = true;
      } catch (error) {
        if (error?.code !== "EEXIST")
          throw error;
        heldLocks.delete(lockPath);
      }
    } finally {
      await fs.unlink(staging).catch(() => {
      });
    }
    if (claimed) {
      if (await fs.readFile(lockPath, "utf-8").catch(() => null) === body)
        break;
      heldLocks.delete(lockPath);
      await delay(jitter(poll));
      poll = Math.min(LOCK_POLL_MAX_MS, poll * 2);
      continue;
    }
    const stale = await staleLockContent(lockPath);
    if (stale !== null) {
      await breakStaleLock(lockPath, stale);
    }
    await delay(jitter(poll));
    poll = Math.min(LOCK_POLL_MAX_MS, poll * 2);
  }
  const refresh = setInterval(() => {
    const now = /* @__PURE__ */ new Date();
    fs.utimes(lockPath, now, now).catch(() => {
    });
  }, LOCK_REFRESH_MS);
  refresh.unref?.();
  try {
    return await fn();
  } finally {
    clearInterval(refresh);
    heldLocks.delete(lockPath);
    await releaseLock(lockPath, body);
  }
}
function jitter(ms) {
  return ms + Math.floor(Math.random() * ms);
}
var heldByContext = new AsyncLocalStorage();
async function withReentrantWriteLock(key, fn) {
  const held = heldByContext.getStore();
  if (held?.has(key))
    return fn();
  const nested = new Set(held ?? []);
  nested.add(key);
  return withInProcessLock(key, () => withFileLock(key, () => heldByContext.run(nested, fn)));
}
var TrackerFileSystem = class {
  dataDir;
  initialized = false;
  logger;
  index;
  constructor(dataDir, options = {}) {
    this.dataDir = dataDir;
    this.logger = options.logger ?? SILENT_LOGGER;
    this.index = new TicketIndex(dataDir);
  }
  resolvePath(...paths) {
    return path3.join(this.dataDir, ...paths);
  }
  async ensureInitialized() {
    if (this.initialized)
      return;
    await fs.mkdir(this.dataDir, { recursive: true });
    const requiredDirs = ["tickets", "features"];
    for (const dir of requiredDirs) {
      await this.ensureDir(dir);
    }
    await this.ensureStatusFiles();
    await this.sweepStaleTempFiles();
    this.initialized = true;
  }
  /**
   * Removes temp files a crashed write left behind.
   *
   * Not merely tidiness. A stranded temp under `<status>/feature-X/` makes
   * TicketOperations.cleanupOrphanDir count a leftover and refuse to remove an
   * emptied feature directory, and one at the data-dir root shows up in
   * `git status` since the store is tracked.
   *
   * The age floor is load-bearing: a temp younger than it may belong to a write
   * happening right now in another process, and deleting that would turn a
   * cosmetic problem into a lost write. Failures are swallowed — a sweep that
   * cannot run must not stop the store from initialising.
   */
  async sweepStaleTempFiles() {
    const cutoff = Date.now() - TEMP_SWEEP_AGE_MS;
    const sweep = async (dirPath, depth) => {
      let entries;
      try {
        entries = await fs.readdir(dirPath, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path3.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          if (depth > 0)
            await sweep(full, depth - 1);
          continue;
        }
        const disposable = TEMP_FILE_PATTERN.test(entry.name) || entry.name.startsWith(`${LOCK_FILENAME}.`) && entry.name !== LOCK_FILENAME;
        if (!disposable)
          continue;
        try {
          const stats = await fs.stat(full);
          if (stats.mtimeMs < cutoff)
            await fs.unlink(full);
        } catch {
        }
      }
    };
    try {
      await sweep(this.dataDir, 2);
    } catch {
    }
  }
  async ensureStatusFiles() {
    const statusFiles = [
      { name: "STATUS-TODO.yaml", status: "todo" },
      { name: "STATUS-IN-PROGRESS.yaml", status: "in-progress" },
      { name: "STATUS-DONE.yaml", status: "done" }
    ];
    for (const file of statusFiles) {
      if (!await this.existsWithoutInit(file.name)) {
        const defaultContent = {
          status: file.status,
          last_updated: (/* @__PURE__ */ new Date()).toISOString(),
          total_tickets: 0,
          summary: {},
          priorities: {
            high: 0,
            medium: 0,
            low: 0
          },
          blocked_tickets: []
        };
        const yamlContent = dump(defaultContent, { lineWidth: -1 });
        await writeFileAtomic(this.resolvePath(file.name), yamlContent, this.dataDir);
        this.logger(`\u{1F4DD} Created ${file.name}`);
      }
    }
    if (!await this.existsWithoutInit("PRIORITY.yaml")) {
      const priorityContent = {
        last_updated: (/* @__PURE__ */ new Date()).toISOString(),
        high_priority_tickets: [],
        medium_priority_tickets: [],
        low_priority_tickets: []
      };
      const yamlContent = dump(priorityContent, { lineWidth: -1 });
      await writeFileAtomic(this.resolvePath("PRIORITY.yaml"), yamlContent, this.dataDir);
      this.logger("\u{1F4DD} Created PRIORITY.yaml");
    }
    if (!await this.existsWithoutInit("DEPENDENCIES.yaml")) {
      const depsContent = {
        last_updated: (/* @__PURE__ */ new Date()).toISOString(),
        dependencies: {}
      };
      const yamlContent = dump(depsContent, { lineWidth: -1 });
      await writeFileAtomic(this.resolvePath("DEPENDENCIES.yaml"), yamlContent, this.dataDir);
      this.logger("\u{1F4DD} Created DEPENDENCIES.yaml");
    }
  }
  async ensureDir(dirPath) {
    const fullPath = this.resolvePath(dirPath);
    await fs.mkdir(fullPath, { recursive: true });
  }
  async readFile(filePath) {
    await this.ensureInitialized();
    return fs.readFile(this.resolvePath(filePath), "utf-8");
  }
  async writeFile(filePath, content) {
    await this.ensureInitialized();
    await writeFileAtomic(this.resolvePath(filePath), content, this.dataDir);
  }
  /**
   * Runs `fn` with exclusive write access to this dataDir, across processes.
   *
   * Reentrant since #338: a nested call re-enters instead of waiting
   * LOCK_ACQUIRE_TIMEOUT_MS on itself. Reentrancy is scoped to the async
   * context that holds the lock, so a SIBLING operation in the same process
   * still queues — see `withReentrantWriteLock`.
   *
   * Public because the read-modify-writes that need it do not all live in this
   * class: `TicketOperations.createTicket` and `updateFeatureWorkSessionSummary`
   * rewrite `features/<name>.yaml` from outside it.
   *
   * Everything it wraps reaches the disk through readFile/writeFile, which
   * never take the lock themselves — writeFile gets its atomicity from rename.
   */
  async withWriteLock(fn) {
    await this.ensureInitialized();
    const key = path3.resolve(this.dataDir);
    return withReentrantWriteLock(key, fn);
  }
  async existsWithoutInit(filePath) {
    try {
      await fs.access(this.resolvePath(filePath));
      return true;
    } catch {
      return false;
    }
  }
  async exists(filePath) {
    await this.ensureInitialized();
    return this.existsWithoutInit(filePath);
  }
  /**
   * Every ticket in the corpus, served from the derived index (#334).
   *
   * The tickets are the index's own objects and are shared between callers —
   * treat them as read-only. Anything that mutates a ticket before writing it
   * back must go through `readTicket`, which hands out an owned copy.
   */
  async readAllTickets(status) {
    await this.ensureInitialized();
    return this.index.readAll(status);
  }
  /** As `readAllTickets`, but pairs each ticket with its path. Read-only. */
  async readAllTicketEntries(status) {
    await this.ensureInitialized();
    return this.index.readAllEntries(status);
  }
  async readTicket(ticketPath) {
    await this.ensureInitialized();
    const cached = this.index.peek(ticketPath);
    if (cached)
      return structuredClone(cached);
    const content = await this.readFile(ticketPath);
    const ticket = load(content);
    if (!ticket.last_updated) {
      ticket.last_updated = ticket.created;
    }
    return ticket;
  }
  async writeTicket(ticketPath, ticket) {
    const content = dump(ticket, { lineWidth: -1 });
    await this.writeFile(ticketPath, content);
  }
  async updateTicketStatus(ticketPath, newStatus, updateTimestamps = true) {
    const ticket = await this.readTicket(ticketPath);
    const oldStatus = ticket.status;
    if (oldStatus === newStatus) {
      return ticket;
    }
    ticket.status = newStatus;
    if (updateTimestamps) {
      const timestamp2 = (/* @__PURE__ */ new Date()).toISOString();
      ticket.last_updated = timestamp2;
      if (newStatus === "in-progress" && !ticket.started) {
        ticket.started = timestamp2;
      } else if (newStatus === "done" && !ticket.completed) {
        ticket.completed = timestamp2;
      }
    }
    if (!ticket.comments) {
      ticket.comments = [];
    }
    ticket.comments.push({
      author: "system",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      text: `Status changed from '${oldStatus}' to '${newStatus}'`
    });
    await this.writeTicket(ticketPath, ticket);
    await this.updateCentralizedFeatureTracking(ticket.ticket_number, ticket.title, ticket.feature, oldStatus, newStatus);
    return ticket;
  }
  async updateTicketProperties(ticketPath, updates) {
    const ticket = await this.readTicket(ticketPath);
    const changes = [];
    if (updates.priority && updates.priority !== ticket.priority) {
      const oldPriority = ticket.priority;
      ticket.priority = updates.priority;
      changes.push(`Priority changed from '${oldPriority}' to '${updates.priority}'`);
    }
    if (updates.type && updates.type !== ticket.type) {
      const oldType = ticket.type;
      ticket.type = updates.type;
      changes.push(`Type changed from '${oldType}' to '${updates.type}'`);
    }
    if (changes.length > 0) {
      ticket.last_updated = (/* @__PURE__ */ new Date()).toISOString();
      if (!ticket.comments) {
        ticket.comments = [];
      }
      ticket.comments.push({
        author: "system",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        text: changes.join(", ")
      });
      await this.writeTicket(ticketPath, ticket);
    }
    return ticket;
  }
  async readFeature(featurePath) {
    const readmePath = path3.join(featurePath, "README.md");
    const content = await this.readFile(readmePath);
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      throw new Error("Invalid feature README format");
    }
    const frontmatter = load(match[1]);
    const description = content.slice(match[0].length).trim();
    return {
      name: frontmatter.feature,
      title: frontmatter.feature.replace(/-/g, " "),
      priority: frontmatter.priority,
      created: frontmatter.created,
      assignee: frontmatter.assignee,
      tags: frontmatter.tags || [],
      description,
      objectives: []
      // Parse from markdown if needed
    };
  }
  /**
   * The highest ticket number already on disk, or 0 when there are none.
   *
   * Only used to recover a COUNTER.yaml that cannot be trusted (#311).
   * Restarting from 0 would be the simpler recovery and the wrong one: the next
   * create would reuse a number that already names a file, and create-ticket
   * writes by path, so the older ticket would be overwritten without a word —
   * the same silent loss the corrupt counter itself caused.
   */
  async highestTicketNumber() {
    let highest = 0;
    for (const ticketPath of await this.findTickets()) {
      const match = path3.basename(ticketPath).match(/^ticket-(\d+)-/);
      if (!match)
        continue;
      const parsed = parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > highest)
        highest = parsed;
    }
    return highest;
  }
  async getCounter() {
    try {
      const content = await this.readFile("COUNTER.yaml");
      const counterData = load(content);
      const current = counterData?.counter?.current;
      if (typeof current === "number" && Number.isFinite(current)) {
        return current;
      }
      const recovered = await this.highestTicketNumber();
      this.logger(`\u26A0\uFE0F  COUNTER.yaml holds a malformed counter (${JSON.stringify(current)}); recovering from the highest ticket on disk: ${recovered}`);
      await this.setCounter(recovered);
      return recovered;
    } catch (yamlError) {
      try {
        const content = await this.readFile("COUNTER.md");
        return parseInt(content.trim());
      } catch (mdError) {
        this.logger("\u{1F4DD} Initializing ticket counter...");
        await this.setCounter(0);
        return 0;
      }
    }
  }
  async setCounter(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Refusing to write a non-finite ticket counter (${value}) to COUNTER.yaml. The existing counter is unchanged.`);
    }
    const counterData = {
      counter: {
        current: value,
        last_updated: (/* @__PURE__ */ new Date()).toISOString(),
        next: value + 1
      },
      metadata: {
        format_version: 1,
        description: "Global ticket counter for unique ticket numbering",
        auto_increment: true
      }
    };
    const yamlContent = dump(counterData, { lineWidth: -1 });
    await this.writeFile("COUNTER.yaml", yamlContent);
  }
  /**
   * Reserves and returns the next ticket number.
   *
   * The lock spans the whole read-modify-write, not just setCounter (#333).
   * Locking only the write would still let two callers read 332 and both
   * compute 333 — the duplicate is decided in the gap, so the gap is what has
   * to be closed.
   */
  async incrementCounter() {
    return this.withWriteLock(async () => {
      const current = await this.getCounter();
      const next = current + 1;
      await this.setCounter(next);
      return next;
    });
  }
  async findTickets(status) {
    await this.ensureInitialized();
    const entries = await this.index.readAllEntries(status);
    return entries.map((e) => e.path);
  }
  formatTicketNumber(num) {
    return num.toString().padStart(4, "0");
  }
  async moveFile(from, to) {
    const fromPath = this.resolvePath(from);
    const toPath = this.resolvePath(to);
    await this.ensureDir(path3.dirname(to));
    await fs.rename(fromPath, toPath);
  }
  /**
   * Status is a field, so changing it moves nothing (#335). Kept for its
   * callers and for the return contract; the rename plumbing is gone.
   */
  async moveTicket(ticketPath, _fromStatus, _toStatus) {
    return ticketPath;
  }
  async findTicketsByFeature(feature, status) {
    await this.ensureInitialized();
    const entries = await this.index.readAllEntries(status);
    return entries.filter((e) => e.ticket.feature === feature).map((e) => e.path);
  }
  async readdir(dirPath) {
    return fs.readdir(this.resolvePath(dirPath));
  }
  async updateDependencies() {
    const entries = await this.readAllTicketEntries();
    const featureMap = /* @__PURE__ */ new Map();
    const ticketLookup = /* @__PURE__ */ new Map();
    for (const { ticket } of entries) {
      ticketLookup.set(ticket.ticket_number, ticket.title);
    }
    for (const { ticket } of entries) {
      if (ticket.blocks && ticket.blocks.length > 0 || ticket.blocked_by && ticket.blocked_by.length > 0) {
        if (!featureMap.has(ticket.feature)) {
          featureMap.set(ticket.feature, []);
        }
        featureMap.get(ticket.feature).push({
          ticket_number: ticket.ticket_number,
          title: ticket.title,
          blocks: (ticket.blocks || []).map((b) => ({
            ticket_number: b.ticket,
            title: ticketLookup.get(b.ticket) || `Ticket #${b.ticket}`
          })),
          blocked_by: (ticket.blocked_by || []).map((b) => ({
            ticket_number: b.ticket,
            title: ticketLookup.get(b.ticket) || `Ticket #${b.ticket}`
          }))
        });
      }
    }
    const dependenciesData = {
      dependencies: {
        last_updated: (/* @__PURE__ */ new Date()).toISOString(),
        features: Object.fromEntries(featureMap)
      },
      metadata: {
        format_version: 1,
        description: "Ticket dependency tracking with bidirectional relationships"
      }
    };
    const yamlContent = dump(dependenciesData, { lineWidth: -1 });
    await this.writeFile("DEPENDENCIES.yaml", yamlContent);
  }
  /**
   * Finds the path to a ticket YAML file by ticket number, searching `tickets/`.
   * @param ticketNumber - The ticket number to search for
   * @returns The relative path to the ticket YAML file, or null if not found
   */
  async findTicketFile(ticketNumber) {
    await this.ensureInitialized();
    const indexed = await this.index.findPath(ticketNumber);
    if (indexed)
      return indexed;
    const prefix = `ticket-${ticketNumber.toString().padStart(4, "0")}-`;
    if (!await this.exists(TICKETS_DIR))
      return null;
    const files = await fs.readdir(this.resolvePath(TICKETS_DIR));
    for (const file of files) {
      if (file.startsWith(prefix))
        return ticketRelPath(file);
    }
    return null;
  }
  /**
   * Reads a centralized feature YAML file.
   * @param featureName - Feature name (without 'feature-' prefix)
   * @returns The feature data
   */
  async readFeatureYaml(featureName) {
    const featurePath = path3.join("features", `${featureName}.yaml`);
    const content = await this.readFile(featurePath);
    return load(content);
  }
  /**
   * Writes a centralized feature YAML file.
   * @param featureName - Feature name
   * @param feature - Feature data
   */
  async writeFeatureYaml(featureName, feature) {
    const featurePath = path3.join("features", `${featureName}.yaml`);
    const content = dump(feature, { lineWidth: -1, noRefs: true });
    await this.writeFile(featurePath, content);
  }
  /**
   * Updates the design field on a feature.
   */
  async updateFeatureDesign(featureName, design) {
    const feature = await this.readFeatureYaml(featureName);
    feature.design = design;
    await this.writeFeatureYaml(featureName, feature);
    return feature;
  }
  /**
   * Updates the plan field on a feature.
   */
  async updateFeaturePlan(featureName, plan) {
    const feature = await this.readFeatureYaml(featureName);
    feature.plan = {
      ...plan,
      generated_at: plan.generated_at || (/* @__PURE__ */ new Date()).toISOString()
    };
    await this.writeFeatureYaml(featureName, feature);
    return feature;
  }
  /**
   * Updates the review field on a feature.
   */
  async updateFeatureReview(featureName, review) {
    const feature = await this.readFeatureYaml(featureName);
    feature.review = review;
    await this.writeFeatureYaml(featureName, feature);
    return feature;
  }
  /**
   * Updates the worktree field on a feature.
   */
  async updateFeatureWorktree(featureName, worktree) {
    const feature = await this.readFeatureYaml(featureName);
    feature.worktree = {
      ...worktree,
      created_at: worktree.created_at || (/* @__PURE__ */ new Date()).toISOString()
    };
    await this.writeFeatureYaml(featureName, feature);
    return feature;
  }
  /**
   * Updates an implementation step's status within a ticket.
   * @param ticketPath - Path to the ticket YAML file
   * @param stepId - The step ID to update
   * @param status - New status for the step ('pending', 'done', 'skipped')
   * @returns The updated ticket
   */
  async updateImplementationStep(ticketPath, stepId, status) {
    if (!isValidStepStatus(status)) {
      throw new Error(`Invalid step status: ${status}. Valid values: pending, done, skipped`);
    }
    const ticket = await this.readTicket(ticketPath);
    if (!ticket.implementation_steps || ticket.implementation_steps.length === 0) {
      throw new Error(`Ticket has no implementation steps`);
    }
    const step = ticket.implementation_steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found. Valid IDs: ${ticket.implementation_steps.map((s) => s.id).join(", ")}`);
    }
    step.status = status;
    ticket.last_updated = (/* @__PURE__ */ new Date()).toISOString();
    if (status === "done" && ticket.current_step !== void 0 && ticket.current_step === stepId) {
      const nextPending = ticket.implementation_steps.find((s) => s.id > stepId && s.status === "pending");
      if (nextPending) {
        ticket.current_step = nextPending.id;
      }
    }
    await this.writeTicket(ticketPath, ticket);
    return ticket;
  }
  /**
   * Sets the current step pointer for a ticket.
   * @param ticketPath - Path to the ticket YAML file
   * @param stepId - The step ID to set as current
   * @returns The updated ticket
   */
  async setCurrentStep(ticketPath, stepId) {
    const ticket = await this.readTicket(ticketPath);
    if (!ticket.implementation_steps || ticket.implementation_steps.length === 0) {
      throw new Error(`Ticket has no implementation steps`);
    }
    const step = ticket.implementation_steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found. Valid IDs: ${ticket.implementation_steps.map((s) => s.id).join(", ")}`);
    }
    ticket.current_step = stepId;
    ticket.last_updated = (/* @__PURE__ */ new Date()).toISOString();
    await this.writeTicket(ticketPath, ticket);
    return ticket;
  }
  /**
   * Sets the verification result for a ticket.
   * @param ticketPath - Path to the ticket YAML file
   * @param verification - Verification data to set
   * @returns The updated ticket
   */
  async setVerification(ticketPath, verification) {
    const ticket = await this.readTicket(ticketPath);
    ticket.verification = {
      ...verification,
      verified_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    ticket.last_updated = (/* @__PURE__ */ new Date()).toISOString();
    await this.writeTicket(ticketPath, ticket);
    return ticket;
  }
  /**
   * Updates a checklist item within a ticket.
   * @param ticketPath - Path to the ticket YAML file
   * @param index - The checklist item index (0-based)
   * @param checked - Whether the item is checked
   * @returns The updated ticket
   */
  async updateChecklist(ticketPath, index, checked) {
    const ticket = await this.readTicket(ticketPath);
    if (!ticket.checklist || ticket.checklist.length === 0) {
      throw new Error(`Ticket has no checklist items`);
    }
    if (index < 0 || index >= ticket.checklist.length) {
      throw new Error(`Checklist index ${index} out of range. Valid: 0-${ticket.checklist.length - 1}`);
    }
    ticket.checklist[index].checked = checked;
    ticket.last_updated = (/* @__PURE__ */ new Date()).toISOString();
    await this.writeTicket(ticketPath, ticket);
    return ticket;
  }
  /**
   * Moves one ticket between the buckets in `features/<name>.yaml`.
   *
   * The whole read-modify-write is inside the write lock (#338). Without it the
   * gap between the read and the write is a lost bucket entry: a concurrent
   * create, another status change, or a work-session rollup writes the same
   * file, and last-writer-wins reverts whichever moved first. `writeFileAtomic`
   * does not help — it makes the loss clean rather than corrupt. The visible
   * result is `total_tickets` and `completion_percentage` disagreeing with the
   * tickets on disk, which is what `listFeatures` and the kanban UI display.
   */
  async updateCentralizedFeatureTracking(ticketNumber, ticketTitle, featureName, fromStatus, toStatus) {
    try {
      const cleanFeatureName = featureName.startsWith("feature-") ? featureName.substring(8) : featureName;
      const centralizedFeaturePath = path3.join("features", `${cleanFeatureName}.yaml`);
      return await this.withWriteLock(async () => {
        if (!await this.exists(centralizedFeaturePath)) {
          return false;
        }
        const featureContent = await this.readFile(centralizedFeaturePath);
        const feature = load(featureContent);
        if (!feature.tickets) {
          feature.tickets = {
            todo: {},
            in_progress: {},
            done: {}
          };
        }
        const statusMap = {
          "todo": "todo",
          "in-progress": "in_progress",
          "done": "done"
        };
        const fromKey = statusMap[fromStatus];
        const toKey = statusMap[toStatus];
        if (feature.tickets[fromKey]) {
          delete feature.tickets[fromKey][ticketNumber];
        }
        if (!feature.tickets[toKey]) {
          feature.tickets[toKey] = {};
        }
        feature.tickets[toKey][ticketNumber] = ticketTitle;
        const updatedFeature = updateFeatureStatistics(feature);
        await this.stampFeatureActivity(updatedFeature, cleanFeatureName, toStatus);
        const updatedFeatureYaml = dump(updatedFeature, {
          lineWidth: -1,
          noRefs: true,
          quotingType: '"',
          forceQuotes: false
        });
        await this.writeFile(centralizedFeaturePath, updatedFeatureYaml);
        return true;
      });
    } catch (error) {
      console.error("Failed to update centralized feature tracking:", error);
      return false;
    }
  }
  /**
   * Stamps the activity timestamps on a feature being rewritten (#322).
   *
   * Mutates in place, and NEVER throws: the caller's next act is to write the
   * bucket reassignment, and losing that because a timestamp could not be worked
   * out would trade a real correctness bug for a cosmetic one.
   *
   * `completed` is the interesting one. The obvious implementation stamps
   * `now`, which is wrong — `now` is when the last bucket move was processed,
   * which for any imported or backfilled feature is nothing like when the work
   * finished. It reads instead from the done tickets themselves, taking the
   * latest, and falls back to `now` only when no done ticket carries a date at
   * all (legacy tickets predate Ticket.completed).
   */
  async stampFeatureActivity(feature, cleanFeatureName, toStatus) {
    try {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      feature.last_activity = now;
      if (toStatus !== "todo" && !feature.started) {
        feature.started = now;
      }
      if (feature.is_completed) {
        feature.completed = await this.latestTicketCompletion(feature, cleanFeatureName) ?? now;
      } else {
        delete feature.completed;
      }
    } catch (error) {
      console.error("Failed to stamp feature activity timestamps:", error);
    }
  }
  /**
   * The latest `completed` among the feature's done tickets, or null if none
   * carries one.
   *
   * Trusts the feature's own `done` bucket for membership rather than each
   * ticket's own `status` field, and that is what makes the answer correct at
   * the moment it is called: `updateCentralizedFeatureTracking` rewrites that
   * bucket, via `stampFeatureActivity`, in the same locked region where
   * `updateTicketStatus` has ALREADY written the closing ticket's `completed`
   * field to `tickets/` (#335 — tickets are flat, filed by number, with no
   * per-status relocation to be mid-flight). So by the time this runs, the
   * bucket and the ticket file it reads agree; there is no race to guard
   * against here, only a read of state that is already settled.
   */
  async latestTicketCompletion(feature, cleanFeatureName) {
    const doneNumbers = new Set(Object.keys(feature.tickets?.done ?? {}).map(Number));
    if (doneNumbers.size === 0)
      return null;
    const ticketPaths = await this.findTicketsByFeature(cleanFeatureName);
    let latest = null;
    for (const ticketPath of ticketPaths) {
      try {
        const ticket = await this.readTicket(ticketPath);
        if (!doneNumbers.has(ticket.ticket_number) || !ticket.completed)
          continue;
        if (latest === null || ticket.completed > latest) {
          latest = ticket.completed;
        }
      } catch {
      }
    }
    return latest;
  }
};
function formatTicketNumber(num) {
  return String(num).padStart(4, "0");
}
function createTicketSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}
function calculateDuration(start, end) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  const durationMs = endTime - startTime;
  if (durationMs < 0) {
    return "00:00:00";
  }
  const totalSeconds = Math.floor(durationMs / 1e3);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function parseDurationToMinutes(duration) {
  const parts = duration.split(":");
  if (parts.length !== 3)
    return 0;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseInt(parts[2], 10) || 0;
  return hours * 60 + minutes + Math.round(seconds / 60);
}
function validateFeatureTickets(tickets) {
  if (!tickets || typeof tickets !== "object") {
    return false;
  }
  const requiredKeys = ["todo", "in_progress", "done"];
  for (const key of requiredKeys) {
    if (!(key in tickets) || typeof tickets[key] !== "object" || tickets[key] === null) {
      return false;
    }
  }
  return true;
}
function calculateFeatureStatistics(tickets) {
  if (!validateFeatureTickets(tickets)) {
    return {
      total_tickets: 0,
      completion_percentage: 0,
      is_completed: false
    };
  }
  const todoCount = Object.keys(tickets.todo || {}).length;
  const inProgressCount = Object.keys(tickets.in_progress || {}).length;
  const doneCount = Object.keys(tickets.done || {}).length;
  const totalTickets = todoCount + inProgressCount + doneCount;
  const completionPercentage = totalTickets > 0 ? Math.round(doneCount / totalTickets * 100) : 0;
  const isCompleted = totalTickets > 0 && todoCount === 0 && inProgressCount === 0;
  return {
    total_tickets: totalTickets,
    completion_percentage: completionPercentage,
    is_completed: isCompleted
  };
}
function updateFeatureStatistics(feature) {
  if (!feature.tickets) {
    feature.tickets = {
      todo: {},
      in_progress: {},
      done: {}
    };
  }
  const statistics = calculateFeatureStatistics(feature.tickets);
  feature.total_tickets = statistics.total_tickets;
  feature.completion_percentage = statistics.completion_percentage;
  feature.is_completed = statistics.is_completed;
  return feature;
}

// ../shared/dist/session-quarantine.js
var QUARANTINE_THRESHOLD_MINUTES = 8 * 60;

// ../shared/dist/prompt-store.js
import { join as join3 } from "path";
import { promises as fs2 } from "fs";
function promptSidecarPath(dataDir, ticketNumber) {
  return join3(dataDir, ".prompts", `ticket-${String(ticketNumber).padStart(4, "0")}.jsonl`);
}
async function readTicketPrompts(dataDir, ticketNumber) {
  const path4 = promptSidecarPath(dataDir, ticketNumber);
  let raw;
  try {
    raw = await fs2.readFile(path4, "utf-8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed)
      continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
    }
  }
  return out;
}
async function writeSessionPrompts(dataDir, ticketNumber, sessionStart, prompts) {
  const existing = await readTicketPrompts(dataDir, ticketNumber);
  const others = existing.filter((p) => p.session_start !== sessionStart);
  const merged = [...others, ...prompts.map((p) => ({ ...p, session_start: sessionStart }))];
  const path4 = promptSidecarPath(dataDir, ticketNumber);
  await fs2.mkdir(join3(dataDir, ".prompts"), { recursive: true });
  if (merged.length === 0) {
    await fs2.rm(path4, { force: true });
    return;
  }
  const body = merged.map((p) => JSON.stringify(p)).join("\n") + "\n";
  await fs2.writeFile(path4, body, "utf-8");
}

// ../shared/dist/activity.js
var STATUS_CHANGE_RE = /^Status changed from '(.+)' to '(.+)'$/;
var COMMIT_HASH_RE = /`([a-f0-9]{7,8})`/g;
var VERIFICATION_RE = /\*\*Verification\*\*|^Verification:/im;
var STALE_MS = 48 * 60 * 60 * 1e3;
var COMMENT_SUMMARY_LENGTH = 200;
function iso(value) {
  if (value instanceof Date)
    return value.toISOString();
  return String(value ?? "");
}
function extractCommitMessage(line, hash, afterHashIdx) {
  const tableMatch = line.match(new RegExp(`^\\s*\\|\\s*\`?${hash}\`?\\s*\\|\\s*([^|]+)\\|`));
  if (tableMatch) {
    const message = tableMatch[1].trim();
    if (message && !/^-+$/.test(message))
      return message;
  }
  const rest = line.slice(afterHashIdx);
  const inlineMatch = rest.match(/^\s*[-–—]\s*(.+)$/);
  if (inlineMatch)
    return inlineMatch[1].trim();
  return void 0;
}
function base(ticket) {
  return {
    ticket: ticket.ticket_number,
    ticketTitle: ticket.title,
    feature: ticket.feature
  };
}
function deriveEvents(tickets) {
  const events = [];
  for (const ticket of tickets) {
    events.push({
      ...base(ticket),
      ts: iso(ticket.created),
      type: "ticket-created",
      actor: ticket.reporter || "unknown",
      summary: `Created: ${ticket.title}`
    });
    if (ticket.completed) {
      events.push({
        ...base(ticket),
        ts: iso(ticket.completed),
        type: "ticket-completed",
        actor: "system",
        summary: `Completed: ${ticket.title}`
      });
    }
    for (const session of ticket.work_sessions ?? []) {
      events.push({
        ...base(ticket),
        ts: iso(session.end || session.start),
        type: "session",
        actor: session.agent,
        summary: session.summary || "(no summary)",
        data: {
          tokens: session.tokens ?? 0,
          duration: session.duration,
          start: iso(session.start),
          open: !session.end
        }
      });
    }
    const seenHashes = /* @__PURE__ */ new Set();
    for (const comment of ticket.comments ?? []) {
      const statusMatch = comment.text.match(STATUS_CHANGE_RE);
      if (comment.author === "system" && statusMatch) {
        events.push({
          ...base(ticket),
          ts: iso(comment.timestamp),
          type: "status-change",
          actor: "system",
          summary: `${statusMatch[1]} \u2192 ${statusMatch[2]}`,
          data: { from: statusMatch[1], to: statusMatch[2] }
        });
        continue;
      }
      if (comment.author === "system")
        continue;
      events.push({
        ...base(ticket),
        ts: iso(comment.timestamp),
        type: "comment",
        actor: comment.author,
        summary: comment.text.slice(0, COMMENT_SUMMARY_LENGTH)
      });
      for (const line of comment.text.split("\n")) {
        for (const match of line.matchAll(COMMIT_HASH_RE)) {
          const hash = match[1];
          if (seenHashes.has(hash))
            continue;
          seenHashes.add(hash);
          const message = extractCommitMessage(line, hash, match.index + match[0].length);
          events.push({
            ...base(ticket),
            ts: iso(comment.timestamp),
            type: "commit",
            actor: comment.author,
            summary: message ? `\`${hash}\` ${message}` : `Commit \`${hash}\``,
            data: message ? { hash, message } : { hash }
          });
        }
      }
      if (VERIFICATION_RE.test(comment.text)) {
        const failed = /\bFAIL/.test(comment.text) && !/\bPASS\b/.test(comment.text);
        events.push({
          ...base(ticket),
          ts: iso(comment.timestamp),
          type: "verification",
          actor: comment.author,
          summary: failed ? "Verification FAILED" : "Verification recorded",
          data: { failed }
        });
      }
    }
  }
  return events;
}
function filterEvents(events, query) {
  return events.filter((e) => {
    const day = e.ts.slice(0, 10);
    if (query.from && day < query.from)
      return false;
    if (query.to && day > query.to)
      return false;
    if (query.feature && e.feature !== query.feature)
      return false;
    if (query.ticket !== void 0 && e.ticket !== query.ticket)
      return false;
    if (query.types?.length && !query.types.includes(e.type))
      return false;
    return true;
  });
}
function computeTotals(events, tickets) {
  const inProgress = new Set(tickets.filter((t) => t.status === "in-progress").map((t) => t.ticket_number));
  const activeWithEvents = new Set(events.filter((e) => inProgress.has(e.ticket)).map((e) => e.ticket));
  return {
    events: events.length,
    tokens: events.filter((e) => e.type === "session").reduce((sum, e) => sum + Number(e.data?.tokens ?? 0), 0),
    sessions: events.filter((e) => e.type === "session").length,
    ticketsCompleted: events.filter((e) => e.type === "ticket-completed").length,
    commits: events.filter((e) => e.type === "commit").length,
    activeTickets: activeWithEvents.size
  };
}
function groupEvents(events, groupBy, tickets) {
  const groups = /* @__PURE__ */ new Map();
  for (const event of events) {
    const key = groupBy === "day" ? event.ts.slice(0, 10) : event.feature;
    if (!groups.has(key))
      groups.set(key, []);
    groups.get(key).push(event);
  }
  return Array.from(groups.entries()).map(([key, groupedEvents]) => ({
    key,
    events: groupedEvents,
    totals: computeTotals(groupedEvents, tickets)
  })).sort((a, b) => a.key < b.key ? 1 : -1);
}
function needsAttention(tickets, nowIso) {
  const now = Date.parse(nowIso);
  const flags = [];
  for (const ticket of tickets) {
    if (ticket.status === "in-progress") {
      const lastActivity = Math.max(...(ticket.work_sessions ?? []).map((s) => Date.parse(iso(s.end || s.start))), Date.parse(iso(ticket.started || ticket.created)));
      if (now - lastActivity > STALE_MS) {
        flags.push({
          type: "stale-in-progress",
          ticket: ticket.ticket_number,
          ticketTitle: ticket.title,
          feature: ticket.feature,
          detail: `No session activity since ${new Date(lastActivity).toISOString().slice(0, 10)}`
        });
      }
    }
    for (const comment of ticket.comments ?? []) {
      if (comment.author !== "system" && VERIFICATION_RE.test(comment.text) && /\bFAIL/.test(comment.text) && !/\bPASS\b/.test(comment.text)) {
        flags.push({
          type: "failing-verification",
          ticket: ticket.ticket_number,
          ticketTitle: ticket.title,
          feature: ticket.feature,
          detail: comment.text.slice(0, COMMENT_SUMMARY_LENGTH)
        });
        break;
      }
    }
  }
  return flags;
}
function buildActivity(tickets, query, nowIso = (/* @__PURE__ */ new Date()).toISOString()) {
  const filtered = filterEvents(deriveEvents(tickets), query).sort((a, b) => a.ts < b.ts ? 1 : -1);
  const limited = query.limit ? filtered.slice(0, query.limit) : filtered;
  const groupBy = query.groupBy ?? "day";
  return {
    events: limited,
    groups: groupBy === "none" ? [] : groupEvents(limited, groupBy, tickets),
    totals: computeTotals(filtered, tickets),
    attention: needsAttention(tickets, nowIso)
  };
}

// ../shared/dist/logger.js
import { writeFileSync as writeFileSync2, existsSync, appendFileSync } from "fs";
import { join as join4 } from "path";
var TrackerLogger = class _TrackerLogger {
  scriptCallLogPath;
  verboseLogPath;
  constructor(dataPath = "plan/tracker-data") {
    this.scriptCallLogPath = join4(dataPath, "scriptcall.log");
    this.verboseLogPath = join4(dataPath, "verbose.log");
  }
  getCurrentTimestamp() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  ensureLogFileExists(filePath) {
    if (!existsSync(filePath)) {
      writeFileSync2(filePath, `# Tracker Script Log
# Created: ${this.getCurrentTimestamp()}

`);
    }
  }
  logScriptCall(scriptName, args) {
    this.ensureLogFileExists(this.scriptCallLogPath);
    const timestamp2 = this.getCurrentTimestamp();
    const command = `${scriptName} ${args.join(" ")}`;
    const logLine = `[${timestamp2}] ${command}
`;
    appendFileSync(this.scriptCallLogPath, logLine);
  }
  logVerboseOutput(scriptName, args, output, error, exitCode) {
    this.ensureLogFileExists(this.verboseLogPath);
    const timestamp2 = this.getCurrentTimestamp();
    const command = `${scriptName} ${args.join(" ")}`;
    let logEntry = `
[${timestamp2}] COMMAND: ${command}
`;
    logEntry += `EXIT CODE: ${exitCode || 0}
`;
    if (output) {
      logEntry += `STDOUT:
${output}
`;
    }
    if (error) {
      logEntry += `STDERR:
${error}
`;
    }
    logEntry += `${"=".repeat(80)}
`;
    appendFileSync(this.verboseLogPath, logEntry);
  }
  static getInstance(dataPath) {
    return new _TrackerLogger(dataPath);
  }
};
function logScriptExecution(scriptName, args, output, error, exitCode, dataPath) {
  const loggerInstance = TrackerLogger.getInstance(dataPath);
  loggerInstance.logScriptCall(scriptName, args);
  loggerInstance.logVerboseOutput(scriptName, args, output, error, exitCode);
}

// ../../node_modules/.pnpm/commander@9.5.0/node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// ../shared/dist/error-handling.js
var ScriptError = class extends Error {
  code;
  details;
  cause;
  constructor(code, message, details, cause) {
    super(message);
    this.name = "ScriptError";
    this.code = code;
    this.details = details;
    this.cause = cause;
  }
};
var ValidationError = class extends ScriptError {
  constructor(message, details) {
    super("VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
};
var TicketNotFoundError = class extends ScriptError {
  constructor(ticketNumber) {
    super("TICKET_NOT_FOUND", `Ticket #${ticketNumber} not found`, { ticketNumber });
    this.name = "TicketNotFoundError";
  }
};
var FeatureNotFoundError = class extends ScriptError {
  constructor(featureName) {
    super("FEATURE_NOT_FOUND", `Feature '${featureName}' not found`, { featureName });
    this.name = "FeatureNotFoundError";
  }
};

// ../shared/dist/ticket-operations.js
var TicketFinder = class {
  fs;
  constructor(dataDir) {
    this.fs = new TrackerFileSystem(dataDir);
  }
  /**
   * Finds a ticket file path by ticket number
   *
   * @param ticketNumber Ticket number to find
   * @returns Promise<string | null> File path if found, null otherwise
   */
  async findTicketFile(ticketNumber) {
    return this.fs.findTicketFile(ticketNumber);
  }
  /**
   * Finds a ticket file path and throws error if not found
   *
   * @param ticketNumber Ticket number to find
   * @returns Promise<string> File path
   * @throws TicketNotFoundError if ticket not found
   */
  async requireTicketFile(ticketNumber) {
    const path4 = await this.findTicketFile(ticketNumber);
    if (!path4) {
      throw new TicketNotFoundError(ticketNumber);
    }
    return path4;
  }
  /**
   * Finds and reads a ticket by number
   *
   * @param ticketNumber Ticket number to read
   * @returns Promise<{ ticket: Ticket; path: string }> Ticket data and file path
   * @throws TicketNotFoundError if ticket not found
   */
  async findAndReadTicket(ticketNumber) {
    const path4 = await this.requireTicketFile(ticketNumber);
    const ticket = await this.fs.readTicket(path4);
    return { ticket, path: path4 };
  }
  /**
   * Checks if a ticket exists
   *
   * @param ticketNumber Ticket number to check
   * @returns Promise<boolean> True if ticket exists
   */
  async ticketExists(ticketNumber) {
    const path4 = await this.findTicketFile(ticketNumber);
    return path4 !== null;
  }
};
var TicketOperations = class {
  fs;
  finder;
  constructor(dataDir) {
    this.fs = new TrackerFileSystem(dataDir);
    this.finder = new TicketFinder(dataDir);
  }
  /**
   * Creates a ticket, reproducing every side effect create-ticket.ts performs.
   *
   * Order matters and is preserved deliberately: validation runs before the
   * counter is touched, so a rejected ticket does not burn a number. The
   * characterisation suite in packages/scripts/src/characterisation pins this.
   *
   * Side effects, all of them:
   *   - COUNTER.yaml increment
   *   - centralised feature registration + updateFeatureStatistics rollup
   *   - the ticket file itself, in tickets/, named ticket-<padded>-<slug>.yaml
   *
   * STATUS-*.yaml and DEPENDENCIES.yaml regeneration used to be on that list.
   * #336 removed it: they are a derived export, refreshed on request by
   * update-all-yaml or the syncDependencies tool, not a write-path side effect.
   *
   * There used to be two more: a todo/feature-<name>/ directory created for the
   * ticket, and a feature.yaml soft link into it. #335 flattens storage to
   * tickets/, where status lives only in the `status:` field, so there is no
   * per-status directory left to create or link.
   *
   * ONE DELIBERATE DIVERGENCE from the original script (#337): a feature with
   * no centralised features/<name>.yaml is now an error. It used to be written
   * into todo/feature-<name>/ with no link, which is how nine orphaned feature
   * directories accumulated — their tickets invisible to listFeatures and
   * counted by nothing. #332 closed the `undefined` case; this closes the
   * general one. checkIntegrity() in integrity.ts reports the drift that
   * predates the check.
   */
  async createTicket(input) {
    const messages = [];
    const type2 = input.type ?? "task";
    const priority = input.priority ?? "medium";
    const validation = validateTicketProperties({ type: type2, priority });
    if (!validation.isValid) {
      throw new ValidationError(validation.errors.join(", "));
    }
    if (typeof input.feature !== "string" || input.feature.trim() === "") {
      throw new ValidationError("Feature name is required and must be a non-empty string");
    }
    if (/[/\\]/.test(input.feature)) {
      throw new ValidationError(`Feature name must not contain a path separator, got: ${input.feature}`);
    }
    const centralizedFeaturePath = `features/${input.feature}.yaml`;
    if (!await this.fs.exists(centralizedFeaturePath)) {
      throw new ValidationError(`Unknown feature "${input.feature}": no ${centralizedFeaturePath} exists. Create the feature first (create-feature --name ${input.feature}), or use an existing name. Run check-integrity to list the features that exist.`);
    }
    return this.fs.withWriteLock(async () => {
      const ticketNumber = await this.fs.incrementCounter();
      return this.registerAndWriteTicket(input, ticketNumber, type2, priority, messages);
    });
  }
  /**
   * The rest of `createTicket`, running inside the write lock.
   *
   * Split out only so the locked region reads as one block; it has no other
   * caller and no meaning outside `createTicket`.
   */
  async registerAndWriteTicket(input, ticketNumber, type2, priority, messages) {
    const centralizedFeaturePath = `features/${input.feature}.yaml`;
    const paddedNumber = formatTicketNumber(ticketNumber);
    const slug = createTicketSlug(input.title);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const ticket = {
      ticket_number: ticketNumber,
      title: input.title,
      description: input.description,
      feature: input.feature,
      type: type2,
      priority,
      status: "todo",
      assignee: "unassigned",
      reporter: input.reporter ?? process.env.USER ?? "cli",
      created: now,
      started: void 0,
      completed: void 0,
      last_updated: now,
      time_spent_minutes: 0,
      labels: input.labels ?? [],
      acceptance_criteria: [],
      comments: [],
      work_sessions: [],
      related_tickets: [],
      blocked_by: [],
      blocks: [],
      attachments: [],
      ai_context: void 0
    };
    try {
      if (await this.fs.exists(centralizedFeaturePath)) {
        const feature = load(await this.fs.readFile(centralizedFeaturePath));
        if (!feature.tickets) {
          feature.tickets = { todo: {}, in_progress: {}, done: {} };
        }
        feature.tickets.todo[ticketNumber] = input.title;
        updateFeatureStatistics(feature);
        await this.fs.writeFile(centralizedFeaturePath, dump(feature, {
          lineWidth: -1,
          noRefs: true,
          quotingType: '"',
          forceQuotes: false
        }));
        messages.push(`\u{1F4CA} Updated centralized feature: ${input.feature}`);
      }
    } catch (err) {
      messages.push(`\u26A0\uFE0F  Could not update centralized feature: ${err}`);
    }
    const filename = `ticket-${paddedNumber}-${slug}.yaml`;
    const path4 = ticketRelPath(filename);
    await this.fs.ensureDir(TICKETS_DIR);
    await this.fs.writeTicket(path4, ticket);
    messages.push(`\u2705 Created ticket #${ticketNumber}: ${input.title}`);
    messages.push(`\u{1F4C1} Location: ${path4}`);
    return { ticket, path: path4, messages };
  }
  /**
   * Updates the last_updated timestamp on a ticket
   *
   * @param ticket Ticket to update
   * @returns Updated ticket with current timestamp
   */
  setLastUpdated(ticket) {
    return {
      ...ticket,
      last_updated: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Updates ticket properties.
   *
   * Type and priority are routed through TrackerFileSystem.updateTicketProperties,
   * which is where two side effects live that a hand-rolled update loses:
   *   - a 'system' comment recording each change ("Priority changed from 'x' to 'y'")
   *   - the write is CONDITIONAL: a no-change update touches nothing at all,
   *     so last_updated is not bumped for an update that changed nothing
   *
   * TWO BUGS FIXED IN THE PREVIOUS VERSION OF THIS METHOD:
   *
   *   1. It called validateTicketProperties(...) and threw the result away —
   *      never checking isValid — so an invalid type or priority was written
   *      straight to disk. update-ticket.ts checks the result and rejects.
   *   2. It set the fields directly, dropping the system comment and writing
   *      unconditionally.
   *
   * Neither could bite before, because this class had no consumers. Both would
   * have shipped the moment it acquired one.
   *
   * The remaining fields (assignee/title/description/labels) have no CLI
   * equivalent — update-ticket.ts accepts only type and priority. They are kept
   * for API callers and applied after, with an explicit last_updated bump.
   */
  async updateTicket(ticketNumber, updates) {
    const path4 = await this.finder.requireTicketFile(ticketNumber);
    const validation = validateTicketProperties({
      ...updates.type && { type: updates.type },
      ...updates.priority && { priority: updates.priority }
    });
    if (!validation.isValid) {
      throw new ValidationError(validation.errors.join(", "));
    }
    const original = await this.fs.readTicket(path4);
    const changes = [];
    if (updates.type && updates.type !== original.type) {
      changes.push(`type: ${original.type} \u2192 ${updates.type}`);
    }
    if (updates.priority && updates.priority !== original.priority) {
      changes.push(`priority: ${original.priority} \u2192 ${updates.priority}`);
    }
    let ticket = original;
    if (updates.type || updates.priority) {
      ticket = await this.fs.updateTicketProperties(path4, {
        ...updates.type && { type: updates.type },
        ...updates.priority && { priority: updates.priority }
      });
    }
    const extra = updates.assignee !== void 0 || updates.title !== void 0 || updates.description !== void 0 || updates.labels !== void 0;
    if (extra) {
      ticket = this.setLastUpdated({
        ...ticket,
        ...updates.assignee !== void 0 && { assignee: updates.assignee },
        ...updates.title !== void 0 && { title: updates.title },
        ...updates.description !== void 0 && { description: updates.description },
        ...updates.labels !== void 0 && { labels: updates.labels }
      });
      await this.fs.writeTicket(path4, ticket);
    }
    const messages = [];
    return { ticket, path: path4, changes, messages };
  }
  /**
   * Updates one implementation step's status.
   *
   * Delegates to TrackerFileSystem, which also AUTO-ADVANCES current_step when
   * the step being completed is the current one — picking the next pending step
   * by id. The UI renders current_step as progress, so reimplementing this
   * without the advance would freeze every ticket's progress indicator at the
   * first step.
   */
  async updateImplementationStep(ticketNumber, stepId, status) {
    const path4 = await this.finder.requireTicketFile(ticketNumber);
    const ticket = await this.fs.updateImplementationStep(path4, stepId, status);
    const step = ticket.implementation_steps.find((s) => s.id === stepId);
    const messages = [
      `\u2705 Updated step ${stepId} to '${status}' on ticket #${ticketNumber}: ${ticket.title}`,
      `\u{1F4CB} Step: [${step.action}] ${step.description}`
    ];
    if (ticket.current_step !== void 0) {
      messages.push(`\u27A1\uFE0F  Current step: ${ticket.current_step}`);
    }
    return { ticket, path: path4, messages };
  }
  /** Moves the current-step pointer without changing any step's status. */
  async setCurrentStep(ticketNumber, stepId) {
    const path4 = await this.finder.requireTicketFile(ticketNumber);
    return { ticket: await this.fs.setCurrentStep(path4, stepId), path: path4 };
  }
  /**
   * Ticks or unticks a checklist item by index.
   *
   * Throws when the ticket has no checklist or the index is out of range,
   * rather than silently doing nothing — matching TrackerFileSystem.
   */
  async updateChecklist(ticketNumber, index, checked) {
    const path4 = await this.finder.requireTicketFile(ticketNumber);
    const ticket = await this.fs.updateChecklist(path4, index, checked);
    const item = ticket.checklist[index];
    const checkedCount = ticket.checklist.filter((c) => c.checked).length;
    return {
      ticket,
      path: path4,
      messages: [
        `\u2705 Updated checklist item on ticket #${ticketNumber}: ${ticket.title}`,
        `${checked ? "\u2611\uFE0F" : "\u2610"} ${item.text}`,
        `\u{1F4CA} Checklist: ${checkedCount}/${ticket.checklist.length} complete`
      ]
    };
  }
  /**
   * Records a verification result.
   *
   * verified_at is stamped by the filesystem layer, and the record REPLACES any
   * previous one rather than accumulating — a ticket carries its latest
   * verification, not a history.
   */
  async recordVerification(ticketNumber, verification) {
    const path4 = await this.finder.requireTicketFile(ticketNumber);
    const ticket = await this.fs.setVerification(path4, verification);
    const messages = [`\u2705 Recorded verification on ticket #${ticketNumber}: ${ticket.title}`];
    if (ticket.verification?.tests_passed !== void 0) {
      messages.push(`\u{1F9EA} Tests: ${ticket.verification.tests_passed ? "PASSED" : "FAILED"}`);
    }
    if (ticket.verification?.build_passed !== void 0) {
      messages.push(`\u{1F528} Build: ${ticket.verification.build_passed ? "PASSED" : "FAILED"}`);
    }
    messages.push(`\u{1F552} Verified at: ${ticket.verification?.verified_at}`);
    return { ticket, path: path4, messages };
  }
  /**
   * Moves a ticket to a different status.
   *
   * Status is a field, not a path (#335): this is a normal write to the
   * ticket's existing location, and there is no rename, no per-status
   * directory, and no feature.yaml link to maintain — #287's directory
   * housekeeping (and the 23 orphaned directories it was fixing) cannot recur
   * because there is no longer a per-status directory to orphan.
   *
   * The work is delegated to TrackerFileSystem.updateTicketStatus, which is
   * where two easily-missed side effects live:
   *   - it appends a 'system' comment recording the transition
   *   - it reassigns the ticket between the centralised feature's todo /
   *     in_progress / done buckets
   * Reimplementing the status change by hand — as an earlier version of this
   * method did — silently dropped both. The characterisation suite pins them.
   *
   * Unlike a hand-rolled reimplementation, a no-op move THROWS rather than
   * returning quietly — matching the script, which exits non-zero with
   * "already in X status".
   *
   * STATUS-* regeneration is not a side effect here (#336): the rollups are an
   * export, not an index, and reads come from the ticket index (#334), which
   * revalidates against the filesystem and so cannot drift from it.
   */
  async moveTicket(ticketNumber, newStatus) {
    const { ticket, path: path4 } = await this.finder.findAndReadTicket(ticketNumber);
    const oldStatus = ticket.status;
    if (oldStatus === newStatus) {
      throw new ValidationError(`Ticket #${ticketNumber} is already in ${newStatus} status`);
    }
    const updatedTicket = await this.fs.updateTicketStatus(path4, newStatus);
    const messages = [
      `\u2705 Moved ticket to ${newStatus} status`,
      `\u{1F4C1} Location: ${path4}`
    ];
    if (newStatus === "in-progress" && updatedTicket.started) {
      messages.push(`\u23F0 Started: ${updatedTicket.started}`);
    } else if (newStatus === "done" && updatedTicket.completed) {
      messages.push(`\u2705 Completed: ${updatedTicket.completed}`);
    }
    return { ticket: updatedTicket, newPath: path4, messages };
  }
  /**
   * Adds a comment to a ticket.
   *
   * THIS METHOD RESOLVES A THREE-WAY DIVERGENCE. Adding a comment was
   * implemented three times, and all three disagreed:
   *
   *   packages/scripts/src/add-comment-helpers.ts (CLI, used by MCP)
   *     - does NOT touch last_updated
   *     - does not trim the author
   *     - serialises with noRefs + quotingType '"'
   *   packages/api/.../tickets.handlers.ts (UI)
   *     - DOES update last_updated
   *     - trims the author, and rejects an empty one with HTTP 400
   *     - serialises via writeTicket, i.e. lineWidth -1 only
   *   this class
   *     - updated last_updated, did not trim
   *
   * So the same user action produced different YAML depending on whether a human
   * used the UI or an agent used the CLI — exactly the silent divergence this
   * feature exists to remove.
   *
   * Unlike the other operations in this class, parity with the CLI is NOT the
   * right goal here: preserving both behaviours would mean carrying a flag and
   * keeping the drift alive. Unified on the API's semantics, which are the more
   * defensible ones and already the majority:
   *
   *   - last_updated IS bumped. Adding a comment is a modification; the UI sorts
   *     and ages tickets by this field, and the CLI leaving it stale is a bug.
   *   - the author is trimmed.
   *
   * Net observable change: CLI-added comments now bump last_updated. Called out
   * deliberately rather than slipped in — the characterisation test for
   * add-comment was updated in the same commit to match.
   */
  async addComment(ticketNumber, text, author) {
    if (!text || text.trim().length === 0) {
      throw new ValidationError("Comment text cannot be empty");
    }
    const { ticket, path: path4 } = await this.finder.findAndReadTicket(ticketNumber);
    const comment = {
      author: author.trim(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      text: text.trim()
    };
    const updatedTicket = this.setLastUpdated({
      ...ticket,
      comments: [...ticket.comments ?? [], comment]
    });
    await this.fs.writeTicket(path4, updatedTicket);
    const messages = [
      `\u2705 Added comment to ticket #${ticketNumber}: ${updatedTicket.title}`,
      `\u{1F4AC} Author: ${comment.author}`,
      `\u{1F4DD} Comment: ${comment.text}`,
      `\u{1F4C1} File: ${path4}`,
      `\u{1F4CA} Total comments on this ticket: ${updatedTicket.comments.length}`
    ];
    return { ticket: updatedTicket, path: path4, messages };
  }
  /**
   * Performs bulk operations on multiple tickets
   *
   * @param ticketNumbers Array of ticket numbers
   * @param operation Function to perform on each ticket
   * @returns Promise<BulkOperationResult> Results of bulk operation
   */
  async bulkOperation(ticketNumbers, operation) {
    const result = {
      successful: [],
      failed: []
    };
    for (const ticketNumber of ticketNumbers) {
      try {
        await operation(ticketNumber);
        result.successful.push(ticketNumber);
      } catch (error) {
        result.failed.push({
          ticketNumber,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return result;
  }
  /**
   * Bulk moves tickets to a new status
   *
   * @param ticketNumbers Array of ticket numbers
   * @param newStatus New status for all tickets
   * @returns Promise<BulkOperationResult> Results of bulk move
   */
  async bulkMoveTickets(ticketNumbers, newStatus) {
    return this.bulkOperation(ticketNumbers, async (ticketNumber) => {
      await this.moveTicket(ticketNumber, newStatus);
    });
  }
  /**
   * Bulk updates ticket priorities
   *
   * @param ticketNumbers Array of ticket numbers
   * @param priority New priority for all tickets
   * @returns Promise<BulkOperationResult> Results of bulk update
   */
  async bulkUpdatePriority(ticketNumbers, priority) {
    return this.bulkOperation(ticketNumbers, async (ticketNumber) => {
      await this.updateTicket(ticketNumber, { priority });
    });
  }
  /**
   * Gets ticket statistics
   *
   * @param ticketNumbers Array of ticket numbers to analyze
   * @returns Promise<TicketStatistics> Statistics about the tickets
   */
  async getTicketStatistics(ticketNumbers) {
    const tickets = ticketNumbers ? await Promise.all(ticketNumbers.map((n) => this.finder.findAndReadTicket(n).then((r) => r.ticket))) : await this.fs.findTickets().then((paths) => Promise.all(paths.map((p) => this.fs.readTicket(p))));
    const stats = {
      total: tickets.length,
      byStatus: {
        todo: tickets.filter((t) => t.status === "todo").length,
        "in-progress": tickets.filter((t) => t.status === "in-progress").length,
        done: tickets.filter((t) => t.status === "done").length
      },
      byPriority: {
        critical: tickets.filter((t) => t.priority === "critical").length,
        high: tickets.filter((t) => t.priority === "high").length,
        medium: tickets.filter((t) => t.priority === "medium").length,
        low: tickets.filter((t) => t.priority === "low").length
      },
      byType: {
        bug: tickets.filter((t) => t.type === "bug").length,
        task: tickets.filter((t) => t.type === "task").length,
        story: tickets.filter((t) => t.type === "story").length,
        spike: tickets.filter((t) => t.type === "spike").length
      },
      totalTimeSpent: tickets.reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0),
      totalComments: tickets.reduce((sum, t) => sum + t.comments.length, 0),
      totalWorkSessions: tickets.reduce((sum, t) => sum + t.work_sessions.length, 0)
    };
    return stats;
  }
};
function createTicketOperations(dataDir) {
  return new TicketOperations(dataDir);
}

// ../shared/dist/integrity.js
import { readdir, readFile, lstat, stat } from "fs/promises";
import { join as join5 } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

// ../shared/dist/yaml-compare.js
var ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
function canonicalScalar(value) {
  if (value instanceof Date)
    return JSON.stringify(value.toISOString());
  if (typeof value === "string" && ISO_INSTANT.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime()))
      return JSON.stringify(parsed.toISOString());
  }
  return JSON.stringify(value);
}
function flattenScalars(value, prefix = "", out = /* @__PURE__ */ new Map()) {
  if (value instanceof Date || value === null || typeof value !== "object") {
    out.set(prefix, canonicalScalar(value));
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0)
      out.set(prefix, "[]");
    value.forEach((v, i2) => flattenScalars(v, `${prefix}[${i2}]`, out));
    return out;
  }
  const keys = Object.keys(value);
  if (keys.length === 0)
    out.set(prefix, "{}");
  for (const k of keys) {
    flattenScalars(value[k], prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}
var DERIVED_FIELDS = /* @__PURE__ */ new Set([
  "total_tickets",
  "completion_percentage",
  "is_completed",
  "work_session_summary"
]);
function rollupTicketNumber(key) {
  const parts = key.split(".");
  if (parts[0] !== "tickets")
    return null;
  return parts.length >= 3 ? parts[2] : null;
}
function rollupTicketNumbers(scalars) {
  const numbers = /* @__PURE__ */ new Set();
  for (const key of scalars.keys()) {
    const number = rollupTicketNumber(key);
    if (number !== null)
      numbers.add(number);
  }
  return numbers;
}
function uniqueFeatureContent(copy, central, centralLabel) {
  const copyScalars = flattenScalars(copy ?? {});
  const centralScalars = flattenScalars(central ?? {});
  const centralTickets = rollupTicketNumbers(centralScalars);
  const unique = [];
  for (const [key, value] of copyScalars) {
    const head = key.split(".")[0].replace(/\[\d+\]$/, "");
    if (DERIVED_FIELDS.has(head))
      continue;
    if (head === "tickets") {
      const number = rollupTicketNumber(key);
      if (number === null || centralTickets.has(number))
        continue;
      unique.push(`${key}=${value} (absent from ${centralLabel})`);
      continue;
    }
    if (!centralScalars.has(key)) {
      unique.push(`${key}=${value} (absent from ${centralLabel})`);
    } else if (centralScalars.get(key) !== value) {
      unique.push(`${key}: copy=${value} central=${centralScalars.get(key)}`);
    }
  }
  return unique;
}

// ../shared/dist/integrity.js
var execFileAsync = promisify(execFile);
var STATUS_DIRS = ["todo", "in-progress", "done"];
var FEATURE_LINK = "feature.yaml";
var SAMPLE_LIMIT = 10;
var BUCKET_BY_STATUS = {
  todo: "todo",
  "in-progress": "in_progress",
  done: "done"
};
var KIND_ORDER = [
  "unreadable-ticket",
  "unreadable-feature-file",
  "feature-directory-without-feature-file",
  "name-collision",
  "feature-copy-holds-unique-content",
  "feature-link-target-missing",
  "feature-link-dangling",
  "feature-link-is-copy",
  "ticket-feature-mismatch",
  "ticket-status-mismatch",
  "feature-rollup-mismatch",
  "feature-file-without-tickets",
  "stray-non-ticket-file",
  "uncommitted-tracker-data"
];
var SEVERITY_BY_KIND = {
  "unreadable-ticket": "error",
  "unreadable-feature-file": "error",
  "feature-directory-without-feature-file": "error",
  // Two tickets that would land on one path in a flat `tickets/`. One would
  // overwrite the other, so this is unconditionally fatal to a flatten.
  "name-collision": "error",
  // The per-status copy is the only record of something. Deleting it — which is
  // what the flatten does to every feature link — loses that content.
  "feature-copy-holds-unique-content": "error",
  // A dangling link over a feature with NO central file: the last mention of
  // that feature anywhere on disk.
  "feature-link-target-missing": "error",
  "feature-link-dangling": "error",
  // Severity is decided per issue: a copy that already disagrees with the
  // central file is an error, one that still matches is a warning about what
  // will happen next.
  "feature-link-is-copy": "warning",
  "ticket-feature-mismatch": "error",
  "ticket-status-mismatch": "error",
  "feature-rollup-mismatch": "error",
  // A feature registered but not yet ticketed is the normal state for the
  // minutes between create-feature and the first create-ticket. Worth naming,
  // not worth failing a build over.
  "feature-file-without-tickets": "warning",
  // The flatten moves tickets and drops the feature link; anything else keeps
  // the directory alive afterwards. Survivable, but a surprise if unannounced.
  "stray-non-ticket-file": "warning",
  // Untracked ticket files are the one part of a migration git cannot roll
  // back. A warning, because committing is the caller's call — `--strict` is
  // how a caller says "refuse on this".
  "uncommitted-tracker-data": "warning"
};
var INTEGRITY_ISSUE_KINDS = Object.keys(SEVERITY_BY_KIND);
async function safeReaddir(dir) {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
async function inspectFeatureLink(dataDir, status, entry, feature, add) {
  const relPath = `${status}/${entry}/feature.yaml`;
  const fullPath = join5(dataDir, relPath);
  let info;
  try {
    info = await lstat(fullPath);
  } catch {
    return;
  }
  const centralPath = `features/${feature}.yaml`;
  const centralFull = join5(dataDir, centralPath);
  if (info.isSymbolicLink()) {
    try {
      await stat(fullPath);
      return;
    } catch {
    }
    let centralExists = true;
    try {
      await stat(centralFull);
    } catch {
      centralExists = false;
    }
    add(centralExists ? {
      kind: "feature-link-dangling",
      feature,
      path: relPath,
      message: `${relPath} is a symlink whose target does not exist`
    } : {
      kind: "feature-link-target-missing",
      feature,
      path: relPath,
      message: `${relPath} is a dangling symlink AND ${centralPath} is absent \u2014 this feature has no surviving definition anywhere`
    });
    return;
  }
  if (!info.isFile())
    return;
  let copyRaw;
  let centralRaw;
  try {
    [copyRaw, centralRaw] = await Promise.all([
      readFile(fullPath, "utf8"),
      readFile(centralFull, "utf8")
    ]);
  } catch {
    add({
      kind: "feature-copy-holds-unique-content",
      feature,
      path: relPath,
      message: `${relPath} is a regular-file copy and ${centralPath} cannot be read \u2014 whatever this copy holds is the only record of it`
    });
    return;
  }
  let unique = [];
  if (copyRaw !== centralRaw) {
    try {
      unique = uniqueFeatureContent(load(copyRaw), load(centralRaw), centralPath);
    } catch (err) {
      add({
        kind: "feature-copy-holds-unique-content",
        feature,
        path: relPath,
        message: `${relPath} is a regular-file copy that cannot be compared with ${centralPath}: ${err instanceof Error ? err.message : String(err)}`
      });
      return;
    }
  }
  if (unique.length > 0) {
    add({
      kind: "feature-copy-holds-unique-content",
      feature,
      path: relPath,
      message: `${relPath} is a regular-file copy holding content absent from ${centralPath}: ${unique.join("; ")}. Deleting it loses that content \u2014 reconcile into the central file first.`
    });
    return;
  }
  add({
    kind: "feature-link-is-copy",
    feature,
    path: relPath,
    message: `${relPath} is a copy, not a symlink \u2014 it will silently diverge from ${centralPath}`
  });
}
async function uncommittedPaths(dataDir) {
  try {
    const { stdout: prefixOut } = await execFileAsync("git", ["rev-parse", "--show-prefix"], {
      cwd: dataDir
    });
    const prefix = prefixOut.trim();
    const { stdout } = await execFileAsync("git", ["status", "--porcelain", "-z", "--untracked-files=all", "--", "."], { cwd: dataDir, maxBuffer: 64 * 1024 * 1024 });
    const paths = [];
    const records = stdout.split("\0");
    for (let i2 = 0; i2 < records.length; i2++) {
      const record = records[i2];
      if (!record)
        continue;
      const status = record.slice(0, 2);
      const repoRelative = record.slice(3);
      paths.push(prefix && repoRelative.startsWith(prefix) ? repoRelative.slice(prefix.length) : repoRelative);
      if (status[0] === "R" || status[0] === "C")
        i2++;
    }
    return paths.sort();
  } catch {
    return [];
  }
}
async function checkIntegrity(dataDir) {
  const issues = [];
  const add = (issue) => {
    issues.push({ ...issue, severity: issue.severity ?? SEVERITY_BY_KIND[issue.kind] });
  };
  const featureFiles = (await safeReaddir(join5(dataDir, "features"))).filter((f) => f.endsWith(".yaml")).sort();
  const registeredFeatures = new Set(featureFiles.map((f) => f.replace(/\.yaml$/, "")));
  const referencedFeatures = /* @__PURE__ */ new Set();
  const diskBuckets = /* @__PURE__ */ new Map();
  let ticketCount = 0;
  let featureDirCount = 0;
  const bucketsFor = (name) => {
    let buckets = diskBuckets.get(name);
    if (!buckets) {
      buckets = { todo: /* @__PURE__ */ new Set(), in_progress: /* @__PURE__ */ new Set(), done: /* @__PURE__ */ new Set() };
      diskBuckets.set(name, buckets);
    }
    return buckets;
  };
  const legacyDirs = (await Promise.all(STATUS_DIRS.map(async (d) => await exists(join5(dataDir, d)) ? d : null))).filter((d) => d !== null);
  if (legacyDirs.length > 0) {
    const claimedBasenames = /* @__PURE__ */ new Map();
    for (const existing of await safeReaddir(join5(dataDir, TICKETS_DIR))) {
      if (isTicketFilename(existing)) {
        claimedBasenames.set(existing, `${TICKETS_DIR}/${existing}`);
      }
    }
    for (const status of legacyDirs) {
      const statusPath = join5(dataDir, status);
      for (const entry of (await safeReaddir(statusPath)).sort()) {
        if (!entry.startsWith("feature-"))
          continue;
        const dirFeature = entry.slice("feature-".length);
        const dirPath = join5(statusPath, entry);
        const dirContents = (await safeReaddir(dirPath)).sort();
        const ticketFiles = dirContents.filter(isTicketFilename);
        if (ticketFiles.length === 0)
          continue;
        featureDirCount++;
        referencedFeatures.add(dirFeature);
        await inspectFeatureLink(dataDir, status, entry, dirFeature, add);
        for (const stray of dirContents) {
          if (isTicketFilename(stray) || stray === FEATURE_LINK)
            continue;
          add({
            kind: "stray-non-ticket-file",
            feature: dirFeature,
            path: `${status}/${entry}/${stray}`,
            message: `${status}/${entry}/${stray} is neither a ticket nor the feature link \u2014 it would keep ${status}/${entry}/ alive after a flatten`
          });
        }
        for (const file of ticketFiles) {
          const relPath = `${status}/${entry}/${file}`;
          const claimant = claimedBasenames.get(file);
          if (claimant) {
            add({
              kind: "name-collision",
              feature: dirFeature,
              path: relPath,
              message: `${relPath} and ${claimant} share a basename \u2014 both want ${TICKETS_DIR}/${file}, and one would overwrite the other`
            });
          } else {
            claimedBasenames.set(file, relPath);
          }
          let ticket;
          try {
            ticket = load(await readFile(join5(dirPath, file), "utf8"));
          } catch (err) {
            add({
              kind: "unreadable-ticket",
              path: relPath,
              feature: dirFeature,
              message: `Cannot parse ${relPath}: ${err instanceof Error ? err.message : String(err)}`
            });
            continue;
          }
          if (!ticket || typeof ticket !== "object") {
            add({
              kind: "unreadable-ticket",
              path: relPath,
              feature: dirFeature,
              message: `${relPath} does not contain a ticket mapping`
            });
            continue;
          }
          ticketCount++;
          const ticketNumber = typeof ticket.ticket_number === "number" ? ticket.ticket_number : void 0;
          if (ticketNumber !== void 0) {
            bucketsFor(dirFeature)[BUCKET_BY_STATUS[status]].add(ticketNumber);
          }
          if (typeof ticket.feature === "string" && ticket.feature !== "") {
            referencedFeatures.add(ticket.feature);
            if (ticket.feature !== dirFeature) {
              add({
                kind: "ticket-feature-mismatch",
                path: relPath,
                feature: dirFeature,
                ticket: ticketNumber,
                message: `${relPath} declares feature "${ticket.feature}" but sits in the "${dirFeature}" directory`
              });
            }
          } else {
            add({
              kind: "ticket-feature-mismatch",
              path: relPath,
              feature: dirFeature,
              ticket: ticketNumber,
              message: `${relPath} has no feature field; its directory says "${dirFeature}"`
            });
          }
          if (ticket.status !== status) {
            add({
              kind: "ticket-status-mismatch",
              path: relPath,
              feature: dirFeature,
              ticket: ticketNumber,
              message: `${relPath} records status "${ticket.status}" but sits in the "${status}" directory`
            });
          }
        }
      }
    }
  }
  for (const file of (await safeReaddir(join5(dataDir, TICKETS_DIR))).sort()) {
    if (!isTicketFilename(file))
      continue;
    const relPath = `${TICKETS_DIR}/${file}`;
    let ticket;
    try {
      ticket = load(await readFile(join5(dataDir, TICKETS_DIR, file), "utf8"));
    } catch (err) {
      add({
        kind: "unreadable-ticket",
        path: relPath,
        message: `Cannot parse ${relPath}: ${err instanceof Error ? err.message : String(err)}`
      });
      continue;
    }
    if (!ticket || typeof ticket !== "object") {
      add({
        kind: "unreadable-ticket",
        path: relPath,
        message: `${relPath} does not contain a ticket mapping`
      });
      continue;
    }
    ticketCount++;
    const ticketNumber = typeof ticket.ticket_number === "number" ? ticket.ticket_number : void 0;
    const bucket = BUCKET_BY_STATUS[ticket.status];
    if (bucket === void 0) {
      add({
        kind: "ticket-status-mismatch",
        path: relPath,
        ticket: ticketNumber,
        message: `${relPath} records status "${ticket.status}", which is not one of todo/in-progress/done`
      });
    }
    if (typeof ticket.feature === "string" && ticket.feature !== "") {
      referencedFeatures.add(ticket.feature);
      if (ticketNumber !== void 0 && bucket !== void 0) {
        bucketsFor(ticket.feature)[bucket].add(ticketNumber);
      }
    } else {
      add({
        kind: "ticket-feature-mismatch",
        path: relPath,
        ticket: ticketNumber,
        message: `${relPath} has no feature field`
      });
    }
  }
  for (const name of [...referencedFeatures].sort()) {
    if (registeredFeatures.has(name))
      continue;
    add({
      kind: "feature-directory-without-feature-file",
      feature: name,
      message: `Feature "${name}" has tickets but no features/${name}.yaml \u2014 its tickets are invisible to listFeatures and counted by no rollup`
    });
  }
  for (const name of [...registeredFeatures].sort()) {
    if (referencedFeatures.has(name))
      continue;
    add({
      kind: "feature-file-without-tickets",
      feature: name,
      message: `Feature "${name}" is registered in features/${name}.yaml but has no tickets`
    });
  }
  for (const name of [...registeredFeatures].sort()) {
    const relPath = `features/${name}.yaml`;
    let featureFile;
    try {
      featureFile = load(await readFile(join5(dataDir, relPath), "utf8"));
    } catch (err) {
      add({
        kind: "unreadable-feature-file",
        feature: name,
        path: relPath,
        message: `Cannot parse ${relPath}: ${err instanceof Error ? err.message : String(err)}`
      });
      continue;
    }
    if (!featureFile || typeof featureFile !== "object") {
      add({
        kind: "unreadable-feature-file",
        feature: name,
        path: relPath,
        message: `${relPath} does not contain a feature mapping`
      });
      continue;
    }
    const onDisk = diskBuckets.get(name);
    if (!onDisk)
      continue;
    const declared = featureFile.tickets ?? {};
    const drifts = [];
    for (const bucket of ["todo", "in_progress", "done"]) {
      const declaredNumbers = new Set(Object.keys(declared[bucket] ?? {}).map((k) => Number(k)).filter((n) => Number.isFinite(n)));
      const missing = [...onDisk[bucket]].filter((n) => !declaredNumbers.has(n)).sort((a, b) => a - b);
      const extra = [...declaredNumbers].filter((n) => !onDisk[bucket].has(n)).sort((a, b) => a - b);
      if (missing.length > 0) {
        drifts.push(`${bucket} missing ${missing.map((n) => `#${n}`).join(", ")}`);
      }
      if (extra.length > 0) {
        drifts.push(`${bucket} lists ${extra.map((n) => `#${n}`).join(", ")} which are not on disk`);
      }
    }
    if (drifts.length > 0) {
      add({
        kind: "feature-rollup-mismatch",
        feature: name,
        path: relPath,
        message: `${relPath} rollup disagrees with the tickets on disk \u2014 ${drifts.join("; ")}`
      });
    }
  }
  const dirty = await uncommittedPaths(dataDir);
  if (dirty.length > 0) {
    const sample = dirty.slice(0, SAMPLE_LIMIT);
    const rest = dirty.length - sample.length;
    add({
      kind: "uncommitted-tracker-data",
      message: `${dirty.length} path(s) under the data dir are modified or untracked: ` + sample.join(", ") + (rest > 0 ? `, and ${rest} more` : "") + `. Untracked ticket files are the one part of a migration git cannot roll back \u2014 commit before applying one.`
    });
  }
  issues.sort((a, b) => {
    const byKind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (byKind !== 0)
      return byKind;
    const byFeature = (a.feature ?? "").localeCompare(b.feature ?? "");
    if (byFeature !== 0)
      return byFeature;
    const byTicket = (a.ticket ?? 0) - (b.ticket ?? 0);
    if (byTicket !== 0)
      return byTicket;
    return (a.path ?? "").localeCompare(b.path ?? "");
  });
  const errors = issues.filter((i2) => i2.severity === "error").length;
  const warnings = issues.length - errors;
  const report = {
    clean: issues.length === 0,
    issues,
    errors,
    warnings,
    counts: {
      features: featureFiles.length,
      featureDirectories: featureDirCount,
      tickets: ticketCount
    },
    messages: []
  };
  report.messages = formatIntegrityReport(report);
  return report;
}
function formatIntegrityReport(report) {
  const { counts } = report;
  const scanned = `\u{1F50D} Checked ${counts.features} feature file(s), ${counts.featureDirectories} feature directory(ies), ${counts.tickets} ticket(s)`;
  if (report.clean) {
    return [scanned, "\u2705 Integrity check passed \u2014 no issues found"];
  }
  const lines = [scanned, ""];
  let lastKind = null;
  for (const issue of report.issues) {
    if (issue.kind !== lastKind) {
      if (lastKind !== null)
        lines.push("");
      lines.push(`${issue.kind}:`);
      lastKind = issue.kind;
    }
    lines.push(`  ${issue.severity === "error" ? "\u274C" : "\u26A0\uFE0F "} ${issue.message}`);
  }
  lines.push("");
  lines.push(`Found ${report.issues.length} issue(s): ${report.errors} error(s), ${report.warnings} warning(s)`);
  return lines;
}

// ../shared/dist/status-reports.js
var STATUSES = ["todo", "in-progress", "done"];
var PRIORITY_ORDER = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};
var UNKNOWN_PRIORITY_RANK = 999;
async function regenerateStatusReports(fs3) {
  const messages = [];
  const allEntries = await fs3.readAllTicketEntries();
  const globalTicketLookup = /* @__PURE__ */ new Map();
  const byStatus = /* @__PURE__ */ new Map();
  for (const status of STATUSES)
    byStatus.set(status, []);
  const unbucketed = [];
  for (const { ticket, path: ticketPath } of allEntries) {
    globalTicketLookup.set(ticket.ticket_number, ticket.title);
    const bucket = ticket.status;
    const list = byStatus.get(bucket);
    if (list) {
      list.push({ ticket, path: ticketPath });
    } else {
      unbucketed.push({ ticket, path: ticketPath });
    }
  }
  if (unbucketed.length > 0) {
    messages.push(`\u26A0\uFE0F  ${unbucketed.length} ticket(s) have a status matching none of todo/in-progress/done and are excluded from every report: ` + unbucketed.map(({ ticket }) => `#${ticket.ticket_number} (status: ${JSON.stringify(ticket.status)})`).join(", "));
  }
  for (const status of STATUSES) {
    const ticketData = byStatus.get(status);
    ticketData.sort((a, b) => {
      const prioDiff = (PRIORITY_ORDER[a.ticket.priority] ?? UNKNOWN_PRIORITY_RANK) - (PRIORITY_ORDER[b.ticket.priority] ?? UNKNOWN_PRIORITY_RANK);
      if (prioDiff !== 0)
        return prioDiff;
      return a.ticket.ticket_number - b.ticket.ticket_number;
    });
    const summary = { critical: 0, high: 0, medium: 0, low: 0 };
    ticketData.forEach(({ ticket }) => {
      const priority = ticket.priority;
      summary[priority]++;
    });
    const priorities = {};
    const featureMap = /* @__PURE__ */ new Map();
    ticketData.forEach(({ ticket }) => {
      const priority = ticket.priority;
      if (!featureMap.has(priority)) {
        featureMap.set(priority, /* @__PURE__ */ new Map());
      }
      const priorityMap = featureMap.get(priority);
      if (!priorityMap.has(ticket.feature)) {
        priorityMap.set(ticket.feature, []);
      }
      priorityMap.get(ticket.feature).push({
        ticket_number: ticket.ticket_number,
        title: ticket.title,
        assignee: ticket.assignee,
        blocked_by: (ticket.blocked_by || []).map((b) => ({
          ticket_number: b.ticket,
          title: globalTicketLookup.get(b.ticket) || `Ticket #${b.ticket}`
        }))
      });
    });
    featureMap.forEach((priorityMap, priority) => {
      if (priorityMap.size > 0) {
        priorities[priority] = [];
        priorityMap.forEach((tickets, feature) => {
          priorities[priority].push({ feature, tickets });
        });
      }
    });
    const blockedTickets = [];
    ticketData.forEach(({ ticket }) => {
      if (ticket.blocked_by && ticket.blocked_by.length > 0) {
        blockedTickets.push({
          ticket_number: ticket.ticket_number,
          title: ticket.title,
          blocked_by: ticket.blocked_by.map((blocker) => ({
            ticket_number: blocker.ticket,
            title: globalTicketLookup.get(blocker.ticket) || `Ticket #${blocker.ticket}`
          })),
          description: ticket.blocked_by.map((b) => b.description).join(", ")
        });
      }
    });
    const statusReport = {
      status,
      last_updated: (/* @__PURE__ */ new Date()).toISOString(),
      total_tickets: ticketData.length,
      summary,
      priorities,
      blocked_tickets: blockedTickets
    };
    await fs3.writeFile(`STATUS-${status.toUpperCase()}.yaml`, dump(statusReport, { lineWidth: -1 }));
    messages.push(`\u2705 Updated STATUS-${status.toUpperCase()}.yaml (${ticketData.length} tickets)`);
  }
  return messages;
}
async function regenerateAllReports(fs3) {
  const messages = await regenerateStatusReports(fs3);
  await fs3.updateDependencies();
  messages.push("\u2705 Updated DEPENDENCIES.yaml");
  return messages;
}

// ../shared/dist/work-session-operations.js
import { join as join6 } from "path";
import { promises as fsp, createReadStream } from "fs";
import { createInterface } from "readline";
import { homedir } from "os";
function getCurrentTimestamp() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function addDurations(duration1, duration2) {
  const minutes1 = parseDurationToMinutes(duration1);
  const minutes2 = parseDurationToMinutes(duration2);
  const totalMinutes = minutes1 + minutes2;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  const seconds = Math.round(totalMinutes % 1 * 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
function updateWorkSessionSummary(workSessions) {
  const summary = {
    total_sessions: 0,
    total_duration: "00:00:00",
    total_tokens: 0,
    agents: {}
  };
  let totalDurationMinutes = 0;
  for (const session of workSessions) {
    if (session.end && session.duration) {
      summary.total_sessions++;
      totalDurationMinutes += parseDurationToMinutes(session.duration);
      if (session.tokens) {
        summary.total_tokens += session.tokens;
      }
      if (!summary.agents[session.agent]) {
        summary.agents[session.agent] = { sessions: 0, duration: "00:00:00", tokens: 0 };
      }
      summary.agents[session.agent].sessions++;
      summary.agents[session.agent].duration = addDurations(summary.agents[session.agent].duration, session.duration);
      if (session.tokens) {
        summary.agents[session.agent].tokens += session.tokens;
      }
    }
  }
  const hours = Math.floor(totalDurationMinutes / 60);
  const minutes = Math.floor(totalDurationMinutes % 60);
  const seconds = Math.round(totalDurationMinutes % 1 * 60);
  summary.total_duration = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  return summary;
}
async function updateFeatureWorkSessionSummary(featureName, dataPath) {
  const messages = [];
  const warnings = [];
  const trackerFs = new TrackerFileSystem(dataPath);
  await trackerFs.withWriteLock(async () => {
    const allWorkSessions = [];
    for (const relPath of await trackerFs.findTicketsByFeature(featureName)) {
      const ticket = await trackerFs.readTicket(relPath);
      if (ticket.work_sessions) {
        allWorkSessions.push(...ticket.work_sessions);
      }
    }
    const featureYamlPath = await findFeatureYamlPath(trackerFs, featureName);
    if (!featureYamlPath) {
      warnings.push(`Could not find feature.yaml for feature ${featureName}`);
      return;
    }
    try {
      const feature = load(await trackerFs.readFile(featureYamlPath));
      feature.work_session_summary = updateWorkSessionSummary(allWorkSessions);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      feature.last_activity = now;
      if (!feature.started) {
        feature.started = now;
      }
      await trackerFs.writeFile(featureYamlPath, dump(feature, { lineWidth: -1 }));
      messages.push(`\u{1F4CA} Updated feature ${featureName} work session summary`);
    } catch (e) {
      warnings.push(`Could not update feature ${featureName} work session summary: ${e}`);
    }
  });
  return { messages, warnings };
}
async function findFeatureYamlPath(trackerFs, featureName) {
  const yamlPath = join6("features", `${featureName}.yaml`);
  return await trackerFs.exists(yamlPath) ? yamlPath : null;
}
function formatWorkSessionSummary(summary, label) {
  const lines = [
    `
\u{1F4CA} ${label} Work Session Summary:`,
    `   Sessions: ${summary.total_sessions}`,
    `   Duration: ${summary.total_duration}`,
    `   Tokens: ${summary.total_tokens}`
  ];
  if (Object.keys(summary.agents).length > 0) {
    lines.push(`   Agents:`);
    for (const [agent, stats] of Object.entries(summary.agents)) {
      lines.push(`     ${agent}: ${stats.sessions} sessions, ${stats.duration}, ${stats.tokens} tokens`);
    }
  }
  return lines;
}
function projectTranscriptDir(claudePath, projectDir) {
  const projectsRoot = join6(claudePath, "projects");
  if (!projectDir)
    return projectsRoot;
  return join6(projectsRoot, projectDir.replace(/\//g, "-"));
}
function belongsToProject(message, projectDir) {
  if (!projectDir)
    return true;
  if (!message.cwd)
    return false;
  return message.cwd.startsWith(projectDir);
}
var TRAILING_GAP_WARN_MS = 6e4;
function deriveSessionEnd(start, prompts, endCommandTime) {
  const last = prompts && prompts.length > 0 ? prompts[prompts.length - 1] : void 0;
  if (!last?.timestamp)
    return { end: endCommandTime };
  if (new Date(last.timestamp).getTime() < new Date(start).getTime()) {
    return { end: endCommandTime };
  }
  const gap = new Date(endCommandTime).getTime() - new Date(last.timestamp).getTime();
  return gap > TRAILING_GAP_WARN_MS ? { end: last.timestamp, truncatedFrom: endCommandTime } : { end: last.timestamp };
}
async function findJSONLFiles(projectPath) {
  const files = [];
  async function scanDir(dir) {
    try {
      for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
        const fullPath = join6(dir, entry.name);
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.name.endsWith(".jsonl")) {
          files.push(fullPath);
        }
      }
    } catch {
    }
  }
  await scanDir(projectPath);
  return files;
}
function calculatePromptCost(usage, model) {
  const pricing = {
    "claude-opus-4-1-20250805": { input: 15, output: 75, cache_write: 18.75, cache_read: 1.5 },
    "claude-sonnet-4-20250514": { input: 3, output: 15, cache_write: 3.75, cache_read: 0.3 }
  };
  const modelPricing = pricing[model || ""] || pricing["claude-opus-4-1-20250805"];
  return (usage.input_tokens || 0) * modelPricing.input / 1e6 + (usage.output_tokens || 0) * modelPricing.output / 1e6 + (usage.cache_creation_input_tokens || 0) * modelPricing.cache_write / 1e6 + (usage.cache_read_input_tokens || 0) * modelPricing.cache_read / 1e6;
}
function generatePromptId() {
  return `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
async function collectPromptsSince(startTimestamp, claudeDataPath = "~/.claude", endTimestamp, sessionId, projectDir) {
  const claudePath = claudeDataPath.replace("~", homedir());
  const jsonlFiles = await findJSONLFiles(projectTranscriptDir(claudePath, projectDir));
  const prompts = [];
  let lastUserMessage;
  let detectedSessionId;
  const ignoredSessions = /* @__PURE__ */ new Map();
  let prevCacheCreation = 0;
  let prevCacheRead = 0;
  for (const file of jsonlFiles) {
    const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) {
      try {
        const message = JSON.parse(line);
        if (message.timestamp && message.timestamp < startTimestamp)
          continue;
        if (endTimestamp && message.timestamp && message.timestamp > endTimestamp)
          continue;
        if (!belongsToProject(message, projectDir))
          continue;
        if (sessionId && message.sessionId && message.sessionId !== sessionId) {
          if (message.message?.role === "assistant" && message.message.usage) {
            ignoredSessions.set(message.sessionId, (ignoredSessions.get(message.sessionId) || 0) + 1);
          }
          continue;
        }
        if (message.message?.role === "user") {
          lastUserMessage = message.message.content?.[0]?.text;
        }
        if (!detectedSessionId && message.sessionId && message.timestamp && message.timestamp >= startTimestamp && (!endTimestamp || message.timestamp <= endTimestamp)) {
          detectedSessionId = sessionId || message.sessionId;
        }
        if (message.message?.role === "assistant" && message.message.usage) {
          const usage = message.message.usage;
          const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
          const cacheReadTokens = usage.cache_read_input_tokens || 0;
          const cacheCreationDelta = cacheCreationTokens < prevCacheCreation ? cacheCreationTokens : cacheCreationTokens - prevCacheCreation;
          const cacheReadDelta = cacheReadTokens < prevCacheRead ? cacheReadTokens : cacheReadTokens - prevCacheRead;
          prevCacheCreation = cacheCreationTokens;
          prevCacheRead = cacheReadTokens;
          const inputTokens = usage.input_tokens || 0;
          const outputTokens = usage.output_tokens || 0;
          prompts.push({
            prompt_id: message.message.id || generatePromptId(),
            timestamp: message.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
            user_message: lastUserMessage,
            assistant_response: message.message.content?.[0]?.text,
            tokens: {
              total: inputTokens + outputTokens + cacheCreationDelta + cacheReadDelta,
              input: inputTokens + cacheCreationDelta + cacheReadDelta,
              output: outputTokens,
              cache_creation: cacheCreationDelta,
              cache_read: cacheReadDelta
            },
            cost_usd: calculatePromptCost({
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cache_creation_input_tokens: cacheCreationDelta,
              cache_read_input_tokens: cacheReadDelta
            }, message.message.model),
            model: message.message.model
          });
        }
      } catch {
      }
    }
  }
  return {
    prompts: prompts.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    sessionId: detectedSessionId,
    ignoredSessions
  };
}
async function detectCurrentClaudeSession(claudeDataPath = "~/.claude", projectDir) {
  const claudePath = claudeDataPath.replace("~", homedir());
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1e3).toISOString();
  const jsonlFiles = await findJSONLFiles(projectTranscriptDir(claudePath, projectDir));
  let mostRecentSession;
  for (const file of jsonlFiles) {
    const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) {
      try {
        const message = JSON.parse(line);
        if (message.timestamp && message.timestamp < fiveMinutesAgo)
          continue;
        if (!belongsToProject(message, projectDir))
          continue;
        if (message.sessionId && message.timestamp) {
          if (!mostRecentSession || message.timestamp > mostRecentSession.timestamp) {
            mostRecentSession = { sessionId: message.sessionId, timestamp: message.timestamp };
          }
        }
      } catch {
      }
    }
  }
  return mostRecentSession?.sessionId;
}
async function updateWorkSessionWithPrompts(ticket, claudeDataPath, projectDir, explicitSessionId, dataPath) {
  const messages = [];
  const warnings = [];
  if (!ticket.work_sessions || ticket.work_sessions.length === 0) {
    throw new Error("No work sessions found");
  }
  let activeSession = null;
  for (let i2 = ticket.work_sessions.length - 1; i2 >= 0; i2--) {
    if (!ticket.work_sessions[i2].end) {
      activeSession = ticket.work_sessions[i2];
      break;
    }
  }
  if (!activeSession) {
    throw new Error("No active work session found");
  }
  if (explicitSessionId && explicitSessionId !== activeSession.claude_session_id) {
    messages.push(`  \u{1F501} Overriding locked session ${activeSession.claude_session_id ?? "(none)"} with explicit ${explicitSessionId}`);
    activeSession.claude_session_id = explicitSessionId;
  }
  const { prompts, sessionId, ignoredSessions } = await collectPromptsSince(activeSession.start, claudeDataPath, activeSession.end, activeSession.claude_session_id, projectDir);
  if (dataPath) {
    await writeSessionPrompts(dataPath, ticket.ticket_number, activeSession.start, prompts);
    delete activeSession.prompts;
  } else {
    activeSession.prompts = prompts;
  }
  const costSummary = summariseSessionCost(prompts);
  activeSession.cost_usd = costSummary.cost_usd;
  activeSession.cost_by_model = costSummary.cost_by_model;
  activeSession.token_breakdown = costSummary.token_breakdown;
  if (sessionId) {
    activeSession.claude_session_id = sessionId;
  }
  const totalTokens = prompts.reduce((sum, p) => sum + p.tokens.total, 0);
  const totalCost = prompts.reduce((sum, p) => sum + p.cost_usd, 0);
  messages.push(`\u2713 Updated work session with ${prompts.length} prompts`);
  messages.push(`  Total tokens: ${totalTokens.toLocaleString()}`);
  messages.push(`  Total cost: $${totalCost.toFixed(2)}`);
  if (sessionId) {
    messages.push(`  Claude session: ${sessionId}${activeSession.claude_session_id ? " (locked)" : ""}`);
  }
  if (projectDir) {
    messages.push(`  Project: ${projectDir}`);
  }
  if (ignoredSessions && ignoredSessions.size > 0) {
    const total = Array.from(ignoredSessions.values()).reduce((sum, count) => sum + count, 0);
    messages.push(`  \u26A0\uFE0F  Ignored ${total} prompts from other sessions:`);
    ignoredSessions.forEach((count, sid) => {
      messages.push(`     - ${sid.substring(0, 8)}...: ${count} prompts`);
    });
  }
  if (prompts.length === 0) {
    const elapsedMs = activeSession.end ? new Date(activeSession.end).getTime() - new Date(activeSession.start).getTime() : Date.now() - new Date(activeSession.start).getTime();
    const ignoredTotal = ignoredSessions ? Array.from(ignoredSessions.values()).reduce((sum, count) => sum + count, 0) : 0;
    warnings.push("");
    warnings.push("  \u26A0\uFE0F  WARNING: no prompts captured for this session \u2014 token/cost data is LOST.");
    warnings.push(`     Elapsed: ${Math.round(elapsedMs / 1e3)}s   Window: ${activeSession.start} -> ${activeSession.end ?? "now"}`);
    warnings.push(`     Locked session id: ${activeSession.claude_session_id ?? "(none \u2014 detection found nothing)"}`);
    if (ignoredTotal > 0) {
      warnings.push(`     ${ignoredTotal} prompt(s) WERE found but belong to other session ids:`);
      ignoredSessions.forEach((count, sid) => {
        warnings.push(`        - ${sid}: ${count} prompt(s)  <-- likely the session that did the work`);
      });
      warnings.push("     => the locked id is probably wrong for this work (see ticket #257).");
    } else {
      warnings.push("     No prompts matched this project at all in the window.");
      warnings.push("     => check that ~/.claude transcripts exist for this project.");
    }
    warnings.push("");
  }
  return { messages, warnings, capturedTokens: totalTokens };
}
async function logWorkSession(options) {
  const { ticketNumber, action, agent, summary, tokens, dataPath = "plan/tracker-data" } = options;
  const messages = [];
  const warnings = [];
  const projectDir = options.projectDir ?? process.env.PROJECT_DIR_HOST ?? process.cwd();
  const trackerFs = new TrackerFileSystem(dataPath);
  const ticketPath = await trackerFs.findTicketFile(ticketNumber);
  if (!ticketPath) {
    throw new Error(`Ticket ${ticketNumber} not found`);
  }
  const ticket = await trackerFs.readTicket(ticketPath);
  messages.push(`
\u{1F3AB} Ticket #${ticketNumber}: ${ticket.title}`);
  messages.push(`   Feature: ${ticket.feature}`);
  messages.push(`   Status: ${ticket.status}`);
  messages.push(`   Priority: ${ticket.priority}`);
  const timestamp2 = getCurrentTimestamp();
  const claudeDataPath = options.claudeDataPath || process.env.CLAUDE_DATA_PATH || "~/.claude";
  const explicitSessionId = options.conversationId?.trim() || process.env.CLAUDE_SESSION_ID?.trim();
  if (action === "start") {
    const currentSessionId = explicitSessionId || await detectCurrentClaudeSession(claudeDataPath, projectDir);
    const newSession = {
      start: timestamp2,
      agent,
      summary,
      claude_session_id: currentSessionId
    };
    if (currentSessionId) {
      messages.push(`\u{1F512} Locked to Claude session: ${currentSessionId}${explicitSessionId ? " (explicit)" : " (detected)"}`);
      if (!explicitSessionId) {
        messages.push(`   (pass --conversation-id to avoid races with other sessions in this project)`);
      }
    } else {
      messages.push(`\u26A0\uFE0F  No active Claude session detected`);
    }
    if (!ticket.work_sessions) {
      ticket.work_sessions = [];
    }
    ticket.work_sessions.push(newSession);
    if (!ticket.started) {
      ticket.started = timestamp2;
    }
    messages.push(`\u2705 Started work session for ticket #${ticketNumber}: ${ticket.title}`);
  } else if (action === "end") {
    let capturedTokens = 0;
    try {
      const result = await updateWorkSessionWithPrompts(ticket, claudeDataPath, projectDir, explicitSessionId, dataPath);
      messages.push(...result.messages);
      warnings.push(...result.warnings);
      capturedTokens = result.capturedTokens;
    } catch (error) {
      warnings.push("");
      warnings.push("  \u26A0\uFE0F  WARNING: prompt capture FAILED \u2014 token/cost data for this session is LOST.");
      warnings.push(`     Reason: ${error instanceof Error ? error.message : String(error)}`);
      warnings.push("     The session will still be closed, but with tokens: 0.");
      warnings.push("");
    }
    if (!ticket.work_sessions || ticket.work_sessions.length === 0) {
      throw new Error(`No work sessions found for ticket ${ticketNumber}`);
    }
    let sessionToEnd = null;
    for (let i2 = ticket.work_sessions.length - 1; i2 >= 0; i2--) {
      const session = ticket.work_sessions[i2];
      if (session.agent === agent && !session.end) {
        sessionToEnd = session;
        break;
      }
    }
    if (!sessionToEnd) {
      throw new Error(`No active work session found for agent ${agent} on ticket ${ticketNumber}`);
    }
    const { end: derivedEnd, truncatedFrom } = deriveSessionEnd(sessionToEnd.start, sessionToEnd.prompts, timestamp2);
    sessionToEnd.end = derivedEnd;
    sessionToEnd.duration = calculateDuration(sessionToEnd.start, derivedEnd);
    sessionToEnd.summary = summary;
    if (truncatedFrom) {
      const droppedMin = Math.round((new Date(truncatedFrom).getTime() - new Date(derivedEnd).getTime()) / 6e4);
      messages.push(`  \u23F1\uFE0F  Ended at last prompt (${derivedEnd}), not command time (${truncatedFrom}) \u2014 ${droppedMin}min of idle/waiting excluded.`);
    }
    const finalTokens = capturedTokens > 0 ? capturedTokens : tokens || 0;
    if (finalTokens) {
      sessionToEnd.tokens = finalTokens;
    }
    messages.push(`\u2705 Ended work session for ticket #${ticketNumber}: ${ticket.title} (duration: ${sessionToEnd.duration})`);
    ticket.time_spent_minutes = (ticket.time_spent_minutes || 0) + parseDurationToMinutes(sessionToEnd.duration);
  } else if (action === "update") {
    const result = await updateWorkSessionWithPrompts(ticket, claudeDataPath, projectDir, explicitSessionId, dataPath);
    messages.push(...result.messages);
    warnings.push(...result.warnings);
    messages.push(`\u2705 Updated work session for ticket #${ticketNumber}: ${ticket.title}`);
  }
  ticket.work_session_summary = updateWorkSessionSummary(ticket.work_sessions);
  ticket.last_updated = (/* @__PURE__ */ new Date()).toISOString();
  await trackerFs.writeTicket(ticketPath, ticket);
  if (ticket.work_session_summary) {
    messages.push(...formatWorkSessionSummary(ticket.work_session_summary, `Ticket #${ticketNumber}`));
  }
  const rollup = await updateFeatureWorkSessionSummary(ticket.feature, dataPath);
  messages.push(...rollup.messages);
  warnings.push(...rollup.warnings);
  const featureYamlPath = await findFeatureYamlPath(trackerFs, ticket.feature);
  if (featureYamlPath) {
    try {
      const feature = load(await trackerFs.readFile(featureYamlPath));
      if (feature.work_session_summary) {
        messages.push(...formatWorkSessionSummary(feature.work_session_summary, `Feature: ${ticket.feature}`));
      }
    } catch {
    }
  }
  messages.push(`
\u{1F4DD} Work session logged for ticket #${ticketNumber}: ${ticket.title}`);
  return { messages, warnings, ticket };
}

// ../shared/dist/feature-operations.js
var FeatureOperations = class {
  fs;
  constructor(dataDir) {
    this.fs = new TrackerFileSystem(dataDir);
  }
  featurePath(name) {
    return `features/${name}.yaml`;
  }
  async requireFeature(name) {
    const path4 = this.featurePath(name);
    if (!await this.fs.exists(path4)) {
      throw new FeatureNotFoundError(name);
    }
    return load(await this.fs.readFile(path4));
  }
  /**
   * Creates a feature: just the centralised file.
   *
   * Before #335 this also created a todo/feature-<name>/ directory and a soft
   * link back to the centralised file. Flat storage has no per-status
   * directory for a fresh feature to seed, so there is nothing left to link.
   *
   * Note create-feature.ts is the one write script that does NOT record a
   * scriptcall.log entry — it predates the logScriptExecution wrapper the others
   * use. That asymmetry is the entrypoint's business, not this layer's, so it is
   * left to the caller (#289 tracks unifying it).
   */
  async createFeature(input) {
    const messages = [];
    await this.fs.ensureDir("features");
    const feature = {
      name: input.name,
      // Kebab-case in, Title Case out.
      title: input.name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      priority: input.priority ?? "medium",
      created: (/* @__PURE__ */ new Date()).toISOString(),
      assignee: "unassigned",
      tags: [],
      // The raw description is never stored verbatim — it is templated.
      description: `## Overview
${input.description}

## Objectives
- TBD`,
      objectives: ["TBD"],
      work_session_summary: {
        total_sessions: 0,
        total_duration: "00:00:00",
        total_tokens: 0,
        agents: {}
      },
      tickets: { todo: {}, in_progress: {}, done: {} },
      total_tickets: 0,
      completion_percentage: 0,
      is_completed: false
    };
    const centralizedPath = this.featurePath(input.name);
    const featureYaml = dump(feature, { lineWidth: -1 });
    await this.fs.writeFile(centralizedPath, featureYaml);
    messages.push(`\u2705 Created feature: ${input.name}`);
    messages.push(`\u{1F4C1} Centralized file: ${centralizedPath}`);
    return { feature, messages, changes: [] };
  }
  /**
   * Edits feature metadata.
   *
   * Change-detecting, like edit-feature.ts: if nothing actually differs, the
   * file is not rewritten at all and `changes` comes back empty. That keeps a
   * redundant edit from churning the YAML.
   */
  async editFeature(name, updates) {
    const feature = await this.requireFeature(name);
    const messages = [`\u{1F4DD} Editing feature: ${feature.title} (${name})`];
    const changes = [];
    if (updates.title && updates.title !== feature.title) {
      changes.push(`title: "${feature.title}" \u2192 "${updates.title}"`);
      feature.title = updates.title;
    }
    if (updates.priority && updates.priority !== feature.priority) {
      if (!TICKET_PRIORITIES.includes(updates.priority)) {
        throw new ValidationError(`Invalid priority: ${updates.priority}. Valid priorities: ${TICKET_PRIORITIES.join(", ")}`);
      }
      changes.push(`priority: "${feature.priority}" \u2192 "${updates.priority}"`);
      feature.priority = updates.priority;
    }
    if (updates.assignee && updates.assignee !== feature.assignee) {
      changes.push(`assignee: "${feature.assignee}" \u2192 "${updates.assignee}"`);
      feature.assignee = updates.assignee;
    }
    if (updates.description && updates.description !== feature.description) {
      changes.push("description updated");
      feature.description = updates.description;
    }
    if (updates.objectives) {
      if (JSON.stringify(updates.objectives) !== JSON.stringify(feature.objectives)) {
        changes.push("objectives updated");
        feature.objectives = updates.objectives;
      }
    }
    if (updates.tags) {
      const newTags = updates.tags.filter((t) => t);
      if (JSON.stringify(newTags) !== JSON.stringify(feature.tags)) {
        changes.push(`tags: [${feature.tags.join(", ")}] \u2192 [${newTags.join(", ")}]`);
        feature.tags = newTags;
      }
    } else {
      if (updates.addTags) {
        const addedTags = updates.addTags.filter((t) => t && !feature.tags.includes(t));
        if (addedTags.length > 0) {
          feature.tags.push(...addedTags);
          changes.push(`added tags: [${addedTags.join(", ")}]`);
        }
      }
      if (updates.removeTags) {
        const toRemove = updates.removeTags.filter((t) => t);
        const removedTags = toRemove.filter((t) => feature.tags.includes(t));
        if (removedTags.length > 0) {
          feature.tags = feature.tags.filter((t) => !toRemove.includes(t));
          changes.push(`removed tags: [${removedTags.join(", ")}]`);
        }
      }
    }
    if (changes.length === 0) {
      messages.push("\u2139\uFE0F  No changes detected. Feature remains unchanged.");
      return { feature, messages, changes };
    }
    await this.fs.writeFile(this.featurePath(name), dump(feature, { lineWidth: -1 }));
    messages.push("\n\u2705 Feature updated successfully!");
    messages.push("\n\u{1F4CB} Changes made:");
    for (const change of changes) {
      messages.push(`   \u2022 ${change}`);
    }
    return { feature, messages, changes };
  }
  /**
   * Records the design approach. approved_at is stamped only when approved.
   *
   * TIMESTAMP RESPONSIBILITY IS INCONSISTENT ONE LAYER DOWN, and this method
   * papers over it deliberately. In TrackerFileSystem:
   *   - updateFeaturePlan stamps generated_at
   *   - updateFeatureWorktree stamps created_at
   *   - updateFeatureDesign and updateFeatureReview stamp NOTHING
   * Two of four. The CLI scripts compensate by building approved_at/reviewed_at
   * themselves before calling, so the gap is invisible from the CLI — but any
   * other caller (the API, MCP in-process) silently writes records with no
   * timestamp at all.
   *
   * Stamping here makes all four consistent regardless of caller, and keeps
   * byte-parity with the scripts.
   */
  async updateDesign(name, design) {
    await this.requireFeature(name);
    const feature = await this.fs.updateFeatureDesign(name, {
      approach: design.approach,
      decisions: design.decisions,
      approved: !!design.approved,
      approved_at: design.approved ? design.approved_at ?? (/* @__PURE__ */ new Date()).toISOString() : void 0
    });
    return {
      feature,
      changes: ["design updated"],
      messages: [
        `\u2705 Updated design on feature '${name}'`,
        `\u{1F4CB} Approach: ${design.approach}`,
        `\u2713 Approved: ${!!design.approved}`
      ]
    };
  }
  /** Records the implementation plan phases. */
  async updatePlan(name, plan) {
    await this.requireFeature(name);
    const feature = await this.fs.updateFeaturePlan(name, plan);
    return {
      feature,
      changes: ["plan updated"],
      messages: [
        `\u2705 Updated plan on feature '${name}'`,
        `\u{1F4CB} Phases: ${plan.phases?.length ?? 0}`,
        // One line per phase, matching update-feature-plan.ts.
        ...(plan.phases ?? []).map((phase) => `  - ${phase.name}: ${phase.tickets?.length || 0} tickets`)
      ]
    };
  }
  /**
   * Records a review outcome. reviewed_at is stamped here — see updateDesign.
   *
   * Fields are assigned in the same order update-feature-review.ts uses rather
   * than spread-then-append, because js-yaml serialises in insertion order and
   * a different order is a different file.
   */
  async updateReview(name, review) {
    await this.requireFeature(name);
    const feature = await this.fs.updateFeatureReview(name, {
      status: review.status,
      reviewer: review.reviewer,
      reviewed_at: review.reviewed_at ?? (/* @__PURE__ */ new Date()).toISOString(),
      notes: review.notes
    });
    return {
      feature,
      changes: ["review updated"],
      messages: [
        `\u2705 Updated review on feature '${name}'`,
        `\u{1F4CB} Status: ${review.status}`,
        ...review.reviewer ? [`\u{1F464} Reviewer: ${review.reviewer}`] : []
      ]
    };
  }
  /** Records the worktree branch and path. */
  async updateWorktree(name, worktree) {
    await this.requireFeature(name);
    const feature = await this.fs.updateFeatureWorktree(name, worktree);
    return {
      feature,
      changes: ["worktree updated"],
      messages: [
        `\u2705 Updated worktree on feature '${name}'`,
        `\u{1F33F} Branch: ${worktree.branch}`,
        ...worktree.path ? [`\u{1F4C1} Path: ${worktree.path}`] : []
      ]
    };
  }
  /** Reads a feature, throwing FeatureNotFoundError when absent. */
  async getFeature(name) {
    return this.requireFeature(name);
  }
};
function createFeatureOperations(dataDir) {
  return new FeatureOperations(dataDir);
}

// ../shared/dist/sorting-utils.js
function sortBy(items, sortFields) {
  if (sortFields.length === 0)
    return items;
  return [...items].sort((a, b) => {
    for (const { field, direction = "asc", comparator } of sortFields) {
      const aValue = getNestedValue(a, field);
      const bValue = getNestedValue(b, field);
      let comparison = 0;
      if (comparator) {
        comparison = comparator(aValue, bValue);
      } else {
        comparison = defaultComparator(aValue, bValue);
      }
      if (comparison !== 0) {
        return direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
}
function sortTicketsBy(tickets, sortByFields = ["number"], reverse = false) {
  const sortFields = sortByFields.map((field) => {
    const direction = reverse ? "desc" : "asc";
    switch (field) {
      case "number":
        return { field: "ticket_number", direction };
      case "priority":
        return {
          field: "priority",
          direction,
          comparator: priorityComparator
        };
      case "created":
        return {
          field: "created",
          direction,
          comparator: dateComparator
        };
      case "started":
        return {
          field: "started",
          direction,
          comparator: dateComparator
        };
      case "completed":
        return {
          field: "completed",
          direction,
          comparator: dateComparator
        };
      case "time":
        return {
          field: "time_spent_minutes",
          direction
        };
      default:
        return { field, direction };
    }
  });
  return sortBy(tickets, sortFields);
}
function priorityComparator(a, b) {
  const priorities = ["critical", "high", "medium", "low"];
  const aIndex = priorities.indexOf(a);
  const bIndex = priorities.indexOf(b);
  if (aIndex === -1 && bIndex === -1)
    return 0;
  if (aIndex === -1)
    return 1;
  if (bIndex === -1)
    return -1;
  return aIndex - bIndex;
}
function dateComparator(a, b) {
  if (a == null && b == null)
    return 0;
  if (a == null)
    return 1;
  if (b == null)
    return -1;
  const dateA = a instanceof Date ? a : new Date(a);
  const dateB = b instanceof Date ? b : new Date(b);
  return dateA.getTime() - dateB.getTime();
}
function getNestedValue(obj, path4) {
  const keys = path4.split(".");
  let value = obj;
  for (const key of keys) {
    if (value == null)
      return null;
    value = value[key];
  }
  return value;
}
function defaultComparator(a, b) {
  if (a == null && b == null)
    return 0;
  if (a == null)
    return 1;
  if (b == null)
    return -1;
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b);
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    return (a ? 1 : 0) - (b ? 1 : 0);
  }
  return String(a).localeCompare(String(b));
}

// ../shared/dist/output-formatters.js
function formatTable(data, columns, options = {}) {
  if (data.length === 0) {
    return "No data to display";
  }
  const { showBorder = true, showHeader = true, compact = false, maxWidth = process.stdout.columns || 120 } = options;
  const columnWidths = columns.map((col) => {
    const headerWidth = col.header.length;
    const maxDataWidth = data.reduce((max, item) => {
      const value = getNestedValue2(item, col.key);
      const formatted = col.formatter ? col.formatter(value, item) : String(value ?? "");
      return Math.max(max, formatted.length);
    }, 0);
    return col.width || Math.min(Math.max(headerWidth, maxDataWidth) + 2, 50);
  });
  const totalWidth = columnWidths.reduce((sum, w) => sum + w, 0) + (columns.length - 1) * 3;
  if (totalWidth > maxWidth) {
    const scale = maxWidth / totalWidth;
    columnWidths.forEach((width, i2) => {
      columnWidths[i2] = Math.max(10, Math.floor(width * scale));
    });
  }
  const lines = [];
  const separator = () => {
    return columnWidths.map((w) => "\u2500".repeat(w)).join(showBorder ? "\u2500\u253C\u2500" : "   ");
  };
  if (showBorder && !compact) {
    lines.push("\u250C\u2500" + separator() + "\u2500\u2510");
  }
  if (showHeader) {
    const headerRow = columns.map((col, i2) => {
      return padString(col.header, columnWidths[i2], col.align || "left");
    }).join(showBorder ? " \u2502 " : "   ");
    lines.push((showBorder ? "\u2502 " : "") + headerRow + (showBorder ? " \u2502" : ""));
    if (showBorder) {
      lines.push("\u251C\u2500" + separator() + "\u2500\u2524");
    } else if (!compact) {
      lines.push(separator().replace(/─/g, "-"));
    }
  }
  data.forEach((item, rowIndex) => {
    const row = columns.map((col, i2) => {
      const value = getNestedValue2(item, col.key);
      const formatted = col.formatter ? col.formatter(value, item) : String(value ?? "");
      return padString(truncateString(formatted, columnWidths[i2] - 2), columnWidths[i2], col.align || "left");
    }).join(showBorder ? " \u2502 " : "   ");
    lines.push((showBorder ? "\u2502 " : "") + row + (showBorder ? " \u2502" : ""));
    if (!compact && showBorder && rowIndex < data.length - 1) {
      lines.push("\u251C\u2500" + separator() + "\u2500\u2524");
    }
  });
  if (showBorder && !compact) {
    lines.push("\u2514\u2500" + separator() + "\u2500\u2518");
  }
  return lines.join("\n");
}
function formatCSV(data, columns) {
  if (data.length === 0) {
    return "";
  }
  const lines = [];
  lines.push(columns.map((col) => escapeCSV(col.header)).join(","));
  data.forEach((item) => {
    const row = columns.map((col) => {
      const value = getNestedValue2(item, col.key);
      const formatted = col.formatter ? col.formatter(value, item) : String(value ?? "");
      return escapeCSV(formatted);
    });
    lines.push(row.join(","));
  });
  return lines.join("\n");
}
function formatJSON(data, pretty = true) {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}
function getNestedValue2(obj, path4) {
  const keys = path4.split(".");
  let value = obj;
  for (const key of keys) {
    if (value == null)
      return null;
    value = value[key];
  }
  return value;
}
function padString(str2, length, align = "left") {
  if (str2.length >= length)
    return str2;
  const padding = length - str2.length;
  switch (align) {
    case "center":
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return " ".repeat(leftPad) + str2 + " ".repeat(rightPad);
    case "right":
      return " ".repeat(padding) + str2;
    default:
      return str2 + " ".repeat(padding);
  }
}
function truncateString(str2, maxLength) {
  if (str2.length <= maxLength)
    return str2;
  return str2.substring(0, maxLength - 3) + "...";
}
function escapeCSV(value) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ../shared/dist/read-operations.js
var DEFAULT_MAX_CHARS = 4e3;
var DEFAULT_TICKET_MAX_CHARS = 8e3;
var NARROW_TICKETS = "narrow with feature: or status:";
var NARROW_FEATURES = "narrow with status: or priority:";
var NARROW_WORK_SESSIONS = "narrow with ticketNumber: or agent:";
var NARROW_ACTIVE_SESSIONS = "narrow with onlyStale: or agent:";
var NARROW_TICKET_SECTIONS = "narrow with sections: or comments:";
function overflowNotice(remaining, maxChars, narrowWith) {
  return `\u2026 ${remaining} (truncated at ${maxChars} chars; ${narrowWith}, or raise maxChars)`;
}
function oversizeNotice(what, maxChars) {
  return `\u2026 (nothing dropped \u2014 ${what} exceeds the ${maxChars}-char budget)`;
}
function validateMaxChars(maxChars) {
  if (maxChars === void 0 || maxChars === null)
    return;
  if (typeof maxChars !== "number" || !Number.isFinite(maxChars) || maxChars <= 0) {
    throw new Error(`Invalid maxChars: ${maxChars}. Must be a positive number of characters; omit it entirely for no budget.`);
  }
}
function applyBudget(records, render, narrowWith, maxChars, spec = {}) {
  const trailer = spec.trailer ?? "";
  const describe = spec.describeDropped ?? ((dropped) => `${dropped.length} more`);
  const full = render(records) + trailer;
  if (maxChars === void 0 || maxChars <= 0 || records.length === 0)
    return full;
  if (full.length <= maxChars)
    return full;
  const assemble = (kept) => {
    const dropped = records.slice(kept);
    const notice = overflowNotice(describe(dropped), maxChars, narrowWith);
    return `${render(records.slice(0, kept))}${trailer}
${notice}`;
  };
  let best = null;
  for (let kept = 1; kept < records.length; kept++) {
    const candidate = assemble(kept);
    if (candidate.length > maxChars)
      break;
    best = candidate;
  }
  if (best !== null)
    return best;
  if (records.length === 1) {
    return `${full}
${oversizeNotice(`this single ${spec.oversizeUnit ?? "record"}`, maxChars)}`;
  }
  return assemble(1);
}
var DEFAULT_COLUMNS = ["number", "status", "type", "priority", "feature", "assignee", "title"];
var VALID_SORT_FIELDS = ["number", "priority", "created", "title"];
var VALID_SEARCH_FIELDS = ["title", "description", "comments"];
var VALID_OUTPUT_FORMATS = [
  "table",
  "json",
  "csv",
  "compact",
  "count"
];
function mapSortField(field) {
  switch (field) {
    case "number":
      return "ticket_number";
    case "created":
    case "title":
    case "priority":
      return field;
    default:
      return "ticket_number";
  }
}
function validateListOptions(options) {
  const output = options.output ?? "table";
  if (!VALID_OUTPUT_FORMATS.includes(output)) {
    throw new Error(`Invalid output format: ${output}. Valid formats: ${VALID_OUTPUT_FORMATS.join(", ")}`);
  }
  for (const field of options.sort ?? ["number"]) {
    if (!VALID_SORT_FIELDS.includes(field)) {
      throw new Error(`Invalid sort field: ${field}. Valid fields: ${VALID_SORT_FIELDS.join(", ")}`);
    }
  }
  for (const field of options.searchIn ?? ["title", "description"]) {
    if (!VALID_SEARCH_FIELDS.includes(field)) {
      throw new Error(`Invalid search field: ${field}. Valid fields: ${VALID_SEARCH_FIELDS.join(", ")}`);
    }
  }
  if (options.createdAfter && isNaN(Date.parse(options.createdAfter))) {
    throw new Error(`Invalid date format for --created-after: ${options.createdAfter}. Use YYYY-MM-DD format.`);
  }
  if (options.createdBefore && isNaN(Date.parse(options.createdBefore))) {
    throw new Error(`Invalid date format for --created-before: ${options.createdBefore}. Use YYYY-MM-DD format.`);
  }
  if (options.limit !== void 0 && (options.limit < 1 || options.limit > 1e4)) {
    throw new Error(`Limit must be between 1 and 10000, got: ${options.limit}`);
  }
  validateMaxChars(options.maxChars);
}
function fieldText(ticket, field, caseSensitive) {
  let value = "";
  if (field === "title")
    value = ticket.title ?? "";
  else if (field === "description")
    value = ticket.description ?? "";
  else if (field === "comments")
    value = (ticket.comments ?? []).map((c) => c.text).join(" ");
  return caseSensitive ? value : value.toLowerCase();
}
function applyFilters(tickets, options) {
  const caseSensitive = !!options.caseSensitive;
  const searchFields = options.searchIn ?? ["title", "description"];
  let filtered = tickets;
  if (options.feature)
    filtered = filtered.filter((t) => t.feature === options.feature);
  if (options.assignee)
    filtered = filtered.filter((t) => t.assignee === options.assignee);
  if (options.type)
    filtered = filtered.filter((t) => t.type === options.type);
  if (options.featureContains) {
    const search = caseSensitive ? options.featureContains : options.featureContains.toLowerCase();
    filtered = filtered.filter((t) => {
      if (!t.feature)
        return false;
      return (caseSensitive ? t.feature : t.feature.toLowerCase()).includes(search);
    });
  }
  if (options.titleContains) {
    const search = caseSensitive ? options.titleContains : options.titleContains.toLowerCase();
    filtered = filtered.filter((t) => {
      if (!t.title)
        return false;
      return (caseSensitive ? t.title : t.title.toLowerCase()).includes(search);
    });
  }
  if (options.keyword) {
    const keyword = caseSensitive ? options.keyword : options.keyword.toLowerCase();
    filtered = filtered.filter((t) => searchFields.some((field) => fieldText(t, field, caseSensitive).includes(keyword)));
  }
  if (options.regex) {
    let regex;
    try {
      regex = new RegExp(options.regex, caseSensitive ? "g" : "gi");
    } catch {
      throw new Error(`Invalid regex pattern: ${options.regex}`);
    }
    filtered = filtered.filter((t) => searchFields.some((field) => {
      const value = fieldText(t, field, true);
      regex.lastIndex = 0;
      return value !== "" && regex.test(value);
    }));
  }
  if (options.labels && options.labels.length > 0) {
    const wanted = options.labels.map((l) => l.trim().toLowerCase());
    filtered = filtered.filter((t) => t.labels && wanted.some((w) => t.labels.some((l) => l.toLowerCase().includes(w))));
  }
  if (options.createdAfter) {
    const after = new Date(options.createdAfter);
    filtered = filtered.filter((t) => new Date(t.created) > after);
  }
  if (options.createdBefore) {
    const before = new Date(options.createdBefore);
    filtered = filtered.filter((t) => new Date(t.created) < before);
  }
  return filtered;
}
function ticketColumns(columnNames) {
  return columnNames.map((col) => ({
    key: col,
    header: col.charAt(0).toUpperCase() + col.slice(1),
    formatter: (_value, ticket) => {
      switch (col.toLowerCase()) {
        case "number":
          return String(ticket.ticket_number).padStart(4, "0");
        case "status":
          return ticket.status || "";
        case "type":
          return ticket.type || "";
        case "priority":
          return ticket.priority || "";
        case "feature":
          return ticket.feature || "";
        case "assignee":
          return ticket.assignee || "";
        case "title":
          return ticket.title || "";
        case "description":
          return (ticket.description || "").replace(/\n/g, " ");
        case "created":
          return ticket.created || "";
        case "labels":
          return (ticket.labels || []).join(";");
        default:
          return "";
      }
    }
  }));
}
var COMPACT_TYPE_LETTERS = {
  bug: "b",
  task: "t",
  story: "s",
  spike: "k"
};
var COMPACT_PRIORITY_LETTERS = {
  critical: "c",
  high: "h",
  medium: "m",
  low: "l"
};
function compactLetter(value, table) {
  if (!value)
    return "?";
  return table[value] ?? value.charAt(0).toLowerCase();
}
function formatCompact(tickets, includeStatus) {
  return tickets.map((t) => {
    const flags = [
      compactLetter(t.type, COMPACT_TYPE_LETTERS),
      compactLetter(t.priority, COMPACT_PRIORITY_LETTERS)
    ];
    if (includeStatus)
      flags.push(t.status);
    const title = (t.title ?? "").replace(/\s+/g, " ").trim();
    return `#${t.ticket_number} ${flags.join("/")} ${t.feature || ""} | ${title}`;
  }).join("\n");
}
async function listTickets(dataDir, options = {}) {
  validateListOptions(options);
  const fs3 = new TrackerFileSystem(dataDir);
  const tickets = await fs3.readAllTickets(options.status);
  let filtered = applyFilters(tickets, options);
  const sortFields = (options.sort ?? ["number"]).map(mapSortField);
  filtered = sortTicketsBy(filtered, sortFields, options.reverse);
  if (options.limit && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }
  const output = options.output ?? "table";
  if (output === "count")
    return String(filtered.length);
  if (filtered.length === 0) {
    if (output === "json")
      return "[]";
    if (output === "csv")
      return "";
    return "No tickets found.";
  }
  if (output === "json")
    return formatJSON(filtered);
  if (output === "compact") {
    return applyBudget(filtered, (subset) => formatCompact(subset, !options.status), NARROW_TICKETS, options.maxChars);
  }
  const columns = ticketColumns(options.columns ?? DEFAULT_COLUMNS);
  if (output === "csv")
    return formatCSV(filtered, columns);
  return applyBudget(filtered, (subset) => formatTable(subset, columns, options.maxWidth ? { maxWidth: options.maxWidth } : {}), NARROW_TICKETS, options.maxChars);
}
var VALID_FEATURE_OUTPUT_FORMATS = ["table", "json", "csv", "compact"];
async function readFeatures(fs3) {
  const features = [];
  let names;
  try {
    names = await fs3.readdir("features");
  } catch {
    return features;
  }
  for (const name of names.sort()) {
    if (!name.endsWith(".yaml"))
      continue;
    try {
      features.push(load(await fs3.readFile(`features/${name}`)));
    } catch {
    }
  }
  return features;
}
function featureStatus(feature) {
  if (feature.is_completed || feature.completion_percentage === 100)
    return "completed";
  const inProgress = Object.keys(feature.tickets?.in_progress ?? {}).length;
  const done = Object.keys(feature.tickets?.done ?? {}).length;
  return inProgress > 0 || done > 0 ? "in-progress" : "todo";
}
function formatCompactFeatures(features, includePriority, includeStatus) {
  return features.map((f) => {
    const feature = f;
    const flags = [];
    if (includePriority)
      flags.push(compactLetter(feature.priority, COMPACT_PRIORITY_LETTERS));
    if (includeStatus)
      flags.push(featureStatus(feature));
    const name = String(feature.name ?? "").replace(/\s+/g, "-").trim();
    const parts = [name];
    if (flags.length > 0)
      parts.push(flags.join("/"));
    parts.push(String(feature.total_tickets ?? 0));
    parts.push(`${feature.completion_percentage ?? 0}%`);
    return parts.join(" ");
  }).join("\n");
}
async function listFeatures(dataDir, options = {}) {
  const output = options.output ?? "table";
  if (!VALID_FEATURE_OUTPUT_FORMATS.includes(output)) {
    throw new Error(`Invalid output format: ${output}. Valid formats: ${VALID_FEATURE_OUTPUT_FORMATS.join(", ")}`);
  }
  validateMaxChars(options.maxChars);
  const fs3 = new TrackerFileSystem(dataDir);
  let features = await readFeatures(fs3);
  if (options.status) {
    features = features.filter((f) => featureStatus(f) === options.status);
  }
  if (options.priority) {
    features = features.filter((f) => f.priority === options.priority);
  }
  if (features.length === 0) {
    if (output === "json")
      return "[]";
    if (output === "csv")
      return "";
    return "No features found.";
  }
  if (output === "json")
    return formatJSON(features);
  if (output === "compact") {
    return applyBudget(features, (subset) => formatCompactFeatures(subset, !options.priority, !options.status), NARROW_FEATURES, options.maxChars);
  }
  const columns = [
    { key: "name", header: "Name", formatter: (_v, f) => f.name || "" },
    { key: "priority", header: "Priority", formatter: (_v, f) => f.priority || "" },
    { key: "status", header: "Status", formatter: (_v, f) => featureStatus(f) },
    {
      key: "tickets",
      header: "Tickets",
      formatter: (_v, f) => String(f.total_tickets ?? 0)
    },
    {
      key: "progress",
      header: "Progress",
      formatter: (_v, f) => `${f.completion_percentage ?? 0}%`
    }
  ];
  if (output === "csv")
    return formatCSV(features, columns);
  return applyBudget(features, (subset) => formatTable(subset, columns), NARROW_FEATURES, options.maxChars);
}
var TICKET_COMMENT_PROJECTIONS = ["none", "last", "all"];
var TICKET_SECTIONS = ["meta", "description", "steps", "comments", "sessions"];
var ESSENTIAL_SECTIONS = ["meta", "description", "steps"];
var LAST_COMMENT_COUNT = 1;
var STATUS_ECHO_RE = /^Status changed from '.*' to '.*'$/;
function isStatusEcho(comment) {
  return comment.author === "system" && STATUS_ECHO_RE.test(String(comment.text ?? "").trim());
}
function resolveSections(options) {
  const comments = options.comments ?? "all";
  if (!TICKET_COMMENT_PROJECTIONS.includes(comments)) {
    throw new Error(`Invalid comments projection: ${comments}. Valid values: ${TICKET_COMMENT_PROJECTIONS.join(", ")}`);
  }
  if (options.sections === void 0)
    return null;
  if (options.sections.length === 0) {
    throw new Error(`sections must name at least one of: ${TICKET_SECTIONS.join(", ")}. Omit the parameter entirely for the whole ticket.`);
  }
  for (const section of options.sections) {
    if (!TICKET_SECTIONS.includes(section)) {
      throw new Error(`Invalid section: ${section}. Valid sections: ${TICKET_SECTIONS.join(", ")}`);
    }
  }
  return new Set(options.sections);
}
async function showTicket(dataDir, ticketNumber, options = {}) {
  validateMaxChars(options.maxChars);
  const requested = resolveSections(options);
  const commentProjection = options.comments ?? "all";
  const want = (section) => requested === null || requested.has(section);
  const fs3 = new TrackerFileSystem(dataDir);
  const path4 = await fs3.findTicketFile(ticketNumber);
  if (!path4)
    throw new TicketNotFoundError(ticketNumber);
  const t = await fs3.readTicket(path4);
  const chunks = [];
  const add = (section, build) => {
    const lines = [];
    build(lines);
    if (lines.length > 0)
      chunks.push({ section, lines });
  };
  if (want("meta"))
    add("meta", (lines) => {
      lines.push(`
\u{1F3AB} Ticket #${t.ticket_number}: ${t.title}`);
      lines.push(`   Feature: ${t.feature}`);
      lines.push(`   Type: ${t.type}`);
      lines.push(`   Priority: ${t.priority}`);
      lines.push(`   Status: ${t.status}`);
      lines.push(`   Assignee: ${t.assignee}`);
      lines.push(`   Reporter: ${t.reporter}`);
      lines.push(`   Created: ${t.created}`);
      if (t.started)
        lines.push(`   Started: ${t.started}`);
      if (t.completed)
        lines.push(`   Completed: ${t.completed}`);
      lines.push(`   Time Spent: ${t.time_spent_minutes || 0} minutes`);
      if (t.labels && t.labels.length > 0)
        lines.push(`   Labels: ${t.labels.join(", ")}`);
    });
  if (want("description"))
    add("description", (lines) => {
      lines.push(`
\u{1F4DD} Description:`);
      lines.push(`   ${t.description}`);
    });
  if (want("meta")) {
    if (t.acceptance_criteria && t.acceptance_criteria.length > 0)
      add("meta", (lines) => {
        lines.push(`
\u2705 Acceptance Criteria:`);
        for (const criterion of t.acceptance_criteria)
          lines.push(`   \u2022 ${criterion}`);
      });
    if (t.blocked_by && t.blocked_by.length > 0)
      add("meta", (lines) => {
        lines.push(`
\u{1F6AB} Blocked by:`);
        for (const b of t.blocked_by) {
          lines.push(`   Ticket #${b.ticket}: ${b.description ?? ""}`);
        }
      });
    if (t.blocks && t.blocks.length > 0)
      add("meta", (lines) => {
        lines.push(`
\u{1F512} Blocks:`);
        for (const b of t.blocks) {
          lines.push(`   Ticket #${b.ticket}: ${b.description ?? ""}`);
        }
      });
    if (t.related_tickets && t.related_tickets.length > 0)
      add("meta", (lines) => {
        lines.push(`
\u{1F517} Related Tickets: ${t.related_tickets.join(", ")}`);
      });
  }
  if (want("steps")) {
    if (t.implementation_steps && t.implementation_steps.length > 0)
      add("steps", (lines) => {
        lines.push(`
\u{1F527} Implementation Steps:`);
        for (const step of t.implementation_steps) {
          const marker = step.status === "done" ? "\u2705" : step.status === "skipped" ? "\u23ED\uFE0F" : "\u2B1C";
          const current = t.current_step === step.id ? " \u2190 current" : "";
          lines.push(`   ${marker} ${step.id}. [${step.action}] ${step.description}${current}`);
        }
      });
    if (t.checklist && t.checklist.length > 0)
      add("steps", (lines) => {
        lines.push(`
\u2611\uFE0F  Checklist:`);
        t.checklist.forEach((item, i2) => {
          lines.push(`   ${item.checked ? "\u2611\uFE0F" : "\u2610"} ${i2}. ${item.text}`);
        });
      });
    if (t.verification)
      add("steps", (lines) => {
        lines.push(`
\u{1F50D} Verification:`);
        if (t.verification.tests_passed !== void 0) {
          lines.push(`   Tests: ${t.verification.tests_passed ? "PASSED" : "FAILED"}`);
        }
        if (t.verification.build_passed !== void 0) {
          lines.push(`   Build: ${t.verification.build_passed ? "PASSED" : "FAILED"}`);
        }
        if (t.verification.verified_at)
          lines.push(`   Verified at: ${t.verification.verified_at}`);
      });
  }
  const allComments = t.comments ?? [];
  if (want("comments") && allComments.length > 0)
    add("comments", (lines) => {
      const substantive = allComments.filter((c) => !isStatusEcho(c));
      const newest = substantive.length > 0 ? substantive : allComments;
      const shown = commentProjection === "all" ? allComments : commentProjection === "last" ? newest.slice(-LAST_COMMENT_COUNT) : [];
      if (shown.length === allComments.length) {
        lines.push(`
\u{1F4AC} Comments (${allComments.length}):`);
      } else {
        lines.push(`
\u{1F4AC} Comments: ${allComments.length} (showing ${shown.length}) \u2014 call with comments:'all' for full history`);
      }
      for (const c of shown) {
        lines.push(`   [${c.timestamp}] ${c.author}:`);
        lines.push(`   ${c.text}`);
        lines.push("");
      }
    });
  if (want("sessions")) {
    if (t.work_sessions && t.work_sessions.length > 0)
      add("sessions", (lines) => {
        lines.push(`
\u23F1\uFE0F  Work Sessions (${t.work_sessions.length}):`);
        for (const s of t.work_sessions) {
          const duration = s.duration ?? "(open)";
          lines.push(`   ${s.start} \u2014 ${duration} \u2014 ${s.agent}: ${s.summary ?? ""}`);
        }
      });
    const summary = t.work_session_summary;
    if (summary)
      add("sessions", (lines) => {
        lines.push(`
\u{1F4CA} Work Session Summary:`);
        lines.push(`   Sessions: ${summary.total_sessions}`);
        lines.push(`   Duration: ${summary.total_duration}`);
        lines.push(`   Tokens: ${summary.total_tokens}`);
        if (summary.agents && Object.keys(summary.agents).length > 0) {
          lines.push(`   Agents:`);
          for (const [agent, stats] of Object.entries(summary.agents)) {
            lines.push(`     ${agent}: ${stats.sessions} sessions, ${stats.duration}, ${stats.tokens} tokens`);
          }
        }
      });
  }
  if (want("meta"))
    add("meta", (lines) => {
      lines.push(`
\u{1F4C2} File: ${path4}`);
    });
  let trailer = "";
  if (requested !== null) {
    const populated = {
      meta: true,
      description: Boolean(t.description),
      steps: Boolean(t.implementation_steps && t.implementation_steps.length > 0 || t.checklist && t.checklist.length > 0 || t.verification),
      comments: allComments.length > 0,
      sessions: Boolean(t.work_sessions && t.work_sessions.length > 0 || t.work_session_summary)
    };
    const omitted = TICKET_SECTIONS.filter((s) => !requested.has(s) && populated[s]);
    if (omitted.length > 0) {
      trailer = `

\u{1F50E} Omitted sections: ${omitted.join(", ")} \u2014 call without \`sections\` for the whole ticket`;
    }
  }
  return budgetSections(chunks, trailer, options.maxChars);
}
function budgetSections(chunks, trailer, maxChars) {
  const render = (subset) => subset.flatMap((c) => c.lines).join("\n") + trailer;
  const full = render(chunks);
  if (maxChars === void 0 || maxChars <= 0 || chunks.length === 0)
    return full;
  if (full.length <= maxChars)
    return full;
  const notice = (dropped2) => {
    const names = TICKET_SECTIONS.filter((s) => dropped2.some((c) => c.section === s));
    const what = `${names.length} more ${names.length === 1 ? "section" : "sections"}: ${names.join(", ")}`;
    return overflowNotice(what, maxChars, NARROW_TICKET_SECTIONS);
  };
  const spendable = chunks.filter((c) => !ESSENTIAL_SECTIONS.includes(c.section));
  const reserve = spendable.length > 0 ? notice(spendable).length + 1 : 0;
  const kept = new Set(chunks.filter((c) => ESSENTIAL_SECTIONS.includes(c.section)));
  const dropped = [];
  for (const chunk of spendable) {
    const candidate = chunks.filter((c) => kept.has(c) || c === chunk);
    if (render(candidate).length + reserve <= maxChars)
      kept.add(chunk);
    else
      dropped.push(chunk);
  }
  if (kept.size === 0) {
    kept.add(chunks[0]);
    dropped.splice(dropped.indexOf(chunks[0]), 1);
  }
  const body = render(chunks.filter((c) => kept.has(c)));
  if (dropped.length === 0) {
    return `${body}
${oversizeNotice("this ticket", maxChars)}`;
  }
  return `${body}
${notice(dropped)}`;
}
async function listWorkSessions(dataDir, options = {}) {
  validateMaxChars(options.maxChars);
  const fs3 = new TrackerFileSystem(dataDir);
  const paths = await fs3.findTickets();
  const rows = [];
  for (const path4 of paths) {
    const ticket = await fs3.readTicket(path4);
    if (options.ticketNumber && ticket.ticket_number !== options.ticketNumber)
      continue;
    for (const session of ticket.work_sessions ?? []) {
      if (options.agent && session.agent !== options.agent)
        continue;
      if (options.startDate && session.start < options.startDate)
        continue;
      if (options.endDate && session.start > options.endDate)
        continue;
      rows.push({
        ticket: ticket.ticket_number,
        title: ticket.title,
        agent: session.agent,
        start: session.start,
        duration: session.duration ?? "(open)",
        tokens: session.tokens ?? 0,
        summary: session.summary ?? ""
      });
    }
  }
  rows.sort((a, b) => String(b.start).localeCompare(String(a.start)));
  if (rows.length === 0) {
    if (options.output === "json")
      return "[]";
    if (options.output === "csv")
      return "";
    return "No work sessions found.";
  }
  if (options.output === "json")
    return formatJSON(rows);
  const columns = [
    { key: "ticket", header: "Ticket", formatter: (_v, r) => String(r.ticket) },
    { key: "agent", header: "Agent", formatter: (_v, r) => r.agent },
    { key: "start", header: "Start", formatter: (_v, r) => r.start },
    { key: "duration", header: "Duration", formatter: (_v, r) => r.duration },
    { key: "tokens", header: "Tokens", formatter: (_v, r) => String(r.tokens) },
    { key: "summary", header: "Summary", formatter: (_v, r) => r.summary }
  ];
  if (options.output === "csv")
    return formatCSV(rows, columns);
  return applyBudget(rows, (subset) => formatTable(subset, columns), NARROW_WORK_SESSIONS, options.maxChars);
}
async function listActiveSessions(dataDir, options = {}) {
  validateMaxChars(options.maxChars);
  const staleThreshold = options.staleThreshold ?? 24;
  const fs3 = new TrackerFileSystem(dataDir);
  const rows = [];
  for (const path4 of await fs3.findTickets()) {
    let ticket;
    try {
      ticket = await fs3.readTicket(path4);
    } catch {
      continue;
    }
    for (const session of ticket.work_sessions ?? []) {
      if (!session.start || session.end)
        continue;
      if (options.agent && session.agent !== options.agent)
        continue;
      const hoursElapsed = (Date.now() - new Date(session.start).getTime()) / (1e3 * 60 * 60);
      rows.push({
        ticketNumber: ticket.ticket_number,
        ticketTitle: ticket.title,
        ticketStatus: ticket.status,
        agent: session.agent,
        start: session.start,
        hoursElapsed: Math.round(hoursElapsed * 100) / 100,
        isStale: hoursElapsed >= staleThreshold,
        summary: session.summary ?? ""
      });
    }
  }
  rows.sort((a, b) => b.hoursElapsed - a.hoursElapsed);
  const visible = options.onlyStale ? rows.filter((r) => r.isStale) : rows;
  if (visible.length === 0) {
    return options.output === "json" ? "[]" : "No active work sessions found.";
  }
  if (options.output === "json")
    return formatJSON(visible);
  const columns = [
    { key: "ticket", header: "Ticket", formatter: (_v, r) => String(r.ticketNumber) },
    { key: "title", header: "Title", formatter: (_v, r) => r.ticketTitle },
    { key: "agent", header: "Agent", formatter: (_v, r) => r.agent },
    { key: "start", header: "Started", formatter: (_v, r) => r.start },
    {
      key: "elapsed",
      header: "Elapsed",
      formatter: (_v, r) => `${r.hoursElapsed}h${r.isStale ? " \u26A0\uFE0F STALE" : ""}`
    }
  ];
  return applyBudget(visible, (subset) => formatTable(subset, columns), NARROW_ACTIVE_SESSIONS, options.maxChars);
}

// ../shared/dist/dependency-operations.js
var DependencyOperations = class {
  fs;
  finder;
  constructor(dataDir) {
    this.fs = new TrackerFileSystem(dataDir);
    this.finder = new TicketFinder(dataDir);
  }
  /**
   * Adds blocked_by / blocks entries to a ticket.
   *
   * Two quirks are preserved from the script because callers may depend on them:
   * a dependency already present is skipped rather than duplicated, and a
   * dependency on a ticket that does not exist is silently dropped — the entry
   * needs the target's feature and title, so with no target there is nothing to
   * write. Neither is an error.
   */
  async addDependencies(input) {
    const dependsOn = input.dependsOn ?? [];
    const blocks = input.blocks ?? [];
    if (dependsOn.length === 0 && blocks.length === 0) {
      throw new ValidationError("Must specify at least one dependency: dependsOn (--depends-on) or blocks (--blocks)");
    }
    const path4 = await this.finder.requireTicketFile(input.ticketNumber);
    const ticket = await this.fs.readTicket(path4);
    if (dependsOn.length > 0) {
      if (!ticket.blocked_by) {
        ticket.blocked_by = [];
      }
      const existing = ticket.blocked_by.map((b) => b.ticket);
      for (const dep of dependsOn) {
        if (!existing.includes(dep)) {
          const entry = await this.describeTicket(dep);
          if (entry)
            ticket.blocked_by.push(entry);
        }
      }
    }
    if (blocks.length > 0) {
      if (!ticket.blocks) {
        ticket.blocks = [];
      }
      const existing = ticket.blocks.map((b) => b.ticket);
      for (const blocked of blocks) {
        if (!existing.includes(blocked)) {
          const entry = await this.describeTicket(blocked);
          if (entry)
            ticket.blocks.push(entry);
        }
      }
    }
    await this.fs.writeTicket(path4, ticket);
    const messages = [`\u2705 Updated dependencies for ticket #${input.ticketNumber}`];
    if (ticket.blocked_by && ticket.blocked_by.length > 0) {
      messages.push(`\u{1F4E5} Blocked by: ${ticket.blocked_by.map((b) => `#${b.ticket}`).join(", ")}`);
    }
    if (ticket.blocks && ticket.blocks.length > 0) {
      messages.push(`\u{1F4E4} Blocks: ${ticket.blocks.map((b) => `#${b.ticket}`).join(", ")}`);
    }
    return { messages };
  }
  /** Removes blocked_by / blocks entries, deleting the field when it empties. */
  async removeDependencies(input) {
    const dependsOn = input.dependsOn ?? [];
    const blocks = input.blocks ?? [];
    if (dependsOn.length === 0 && blocks.length === 0) {
      throw new ValidationError("Must specify at least one dependency to remove: dependsOn (--depends-on) or blocks (--blocks)");
    }
    const path4 = await this.finder.requireTicketFile(input.ticketNumber);
    const ticket = await this.fs.readTicket(path4);
    if (dependsOn.length > 0 && ticket.blocked_by) {
      ticket.blocked_by = ticket.blocked_by.filter((dep) => !dependsOn.includes(dep.ticket));
      if (ticket.blocked_by.length === 0) {
        delete ticket.blocked_by;
      }
    }
    if (blocks.length > 0 && ticket.blocks) {
      ticket.blocks = ticket.blocks.filter((block) => !blocks.includes(block.ticket));
      if (ticket.blocks.length === 0) {
        delete ticket.blocks;
      }
    }
    await this.fs.writeTicket(path4, ticket);
    const messages = [`\u2705 Removed dependencies from ticket #${input.ticketNumber}`];
    if (ticket.blocked_by && ticket.blocked_by.length > 0) {
      messages.push(`\u{1F4E5} Still blocked by: ${ticket.blocked_by.map((b) => `#${b.ticket}`).join(", ")}`);
    }
    if (ticket.blocks && ticket.blocks.length > 0) {
      messages.push(`\u{1F4E4} Still blocks: ${ticket.blocks.map((b) => `#${b.ticket}`).join(", ")}`);
    }
    return { messages };
  }
  /**
   * Lists dependencies for one ticket, or the whole graph when no number is given.
   *
   * The single-ticket rendering is verbatim from the script, indentation included.
   * The whole-graph case is the divergence documented at the top of this file.
   */
  async listDependencies(ticketNumber) {
    if (ticketNumber) {
      const path4 = await this.finder.requireTicketFile(ticketNumber);
      const ticket = await this.fs.readTicket(path4);
      const messages2 = [
        `\u{1F517} Dependencies for Ticket #${ticketNumber}: ${ticket.title}`,
        `   Feature: ${ticket.feature}`,
        `   Status: ${ticket.status}`
      ];
      if (ticket.blocked_by && ticket.blocked_by.length > 0) {
        messages2.push("\u{1F4E5} Blocked by:");
        for (const dep of ticket.blocked_by) {
          messages2.push(`   \u2022 #${dep.ticket}: ${dep.description} (${dep.feature})`);
        }
      } else {
        messages2.push("\u{1F4E5} Blocked by: None");
      }
      if (ticket.blocks && ticket.blocks.length > 0) {
        messages2.push("\u{1F4E4} Blocks:");
        for (const block of ticket.blocks) {
          messages2.push(`   \u2022 #${block.ticket}: ${block.description} (${block.feature})`);
        }
      } else {
        messages2.push("\u{1F4E4} Blocks: None");
      }
      return { messages: messages2 };
    }
    const messages = [];
    const tickets = await this.readAllTickets();
    const withDeps = tickets.filter((t) => t.blocked_by && t.blocked_by.length > 0 || t.blocks && t.blocks.length > 0);
    if (withDeps.length === 0) {
      messages.push("\u{1F517} No dependencies recorded");
      return { messages };
    }
    messages.push(`\u{1F517} Dependency graph (${withDeps.length} tickets with dependencies):`);
    const byFeature = /* @__PURE__ */ new Map();
    for (const ticket of withDeps) {
      if (!byFeature.has(ticket.feature))
        byFeature.set(ticket.feature, []);
      byFeature.get(ticket.feature).push(ticket);
    }
    for (const feature of [...byFeature.keys()].sort()) {
      messages.push(`${feature}:`);
      for (const ticket of byFeature.get(feature)) {
        messages.push(`   \u2022 #${ticket.ticket_number}: ${ticket.title} (${ticket.status})`);
        if (ticket.blocked_by && ticket.blocked_by.length > 0) {
          messages.push(`     \u{1F4E5} Blocked by: ${ticket.blocked_by.map((b) => `#${b.ticket}`).join(", ")}`);
        }
        if (ticket.blocks && ticket.blocks.length > 0) {
          messages.push(`     \u{1F4E4} Blocks: ${ticket.blocks.map((b) => `#${b.ticket}`).join(", ")}`);
        }
      }
    }
    return { messages };
  }
  /**
   * Counts dependencies, blocked tickets and mutual blocks.
   *
   * Arithmetic is unchanged from the script, including two rough edges: an empty
   * tracker divides by zero and reports NaN%, and "cycles" only detects mutual
   * blocks (A blocks B, B blocks A), not longer loops. Both are characterised
   * rather than fixed here — fixing them changes output the UI may be reading.
   */
  async analyzeDependencies() {
    const messages = ["\u{1F50D} Analyzing dependency graph..."];
    const tickets = await this.readAllTickets();
    const totalTickets = tickets.length;
    const withDependencies = tickets.filter((ticket) => ticket.blocked_by && ticket.blocked_by.length > 0 || ticket.blocks && ticket.blocks.length > 0).length;
    const blockedTickets = [];
    for (const ticket of tickets) {
      if (ticket.blocked_by && ticket.blocked_by.length > 0 && ticket.status !== "done") {
        const isBlocked = ticket.blocked_by.some((dep) => {
          const depTicket = tickets.find((t) => t.ticket_number === dep.ticket);
          return depTicket && depTicket.status !== "done";
        });
        if (isBlocked)
          blockedTickets.push(ticket);
      }
    }
    const cycles = [];
    for (const ticket of tickets) {
      if (ticket.blocks) {
        for (const blocked of ticket.blocks) {
          const blockedTicket = tickets.find((t) => t.ticket_number === blocked.ticket);
          if (blockedTicket?.blocks?.some((b) => b.ticket === ticket.ticket_number)) {
            cycles.push(`#${ticket.ticket_number} \u2194 #${blocked.ticket}`);
          }
        }
      }
    }
    messages.push("\u{1F4CA} Dependency Analysis Results:");
    messages.push(`   Total tickets: ${totalTickets}`);
    messages.push(`   With dependencies: ${withDependencies} (${(withDependencies / totalTickets * 100).toFixed(1)}%)`);
    messages.push(`   Currently blocked: ${blockedTickets.length}`);
    messages.push(`   Potential cycles: ${cycles.length}`);
    if (blockedTickets.length > 0) {
      messages.push("\u{1F6AB} Blocked tickets (top 10):");
      blockedTickets.slice(0, 10).forEach((ticket) => {
        messages.push(`   \u2022 #${ticket.ticket_number}: ${ticket.title} (${ticket.feature})`);
      });
    }
    if (cycles.length > 0) {
      messages.push("\u26A0\uFE0F  Potential dependency cycles:");
      [...new Set(cycles)].forEach((cycle) => {
        messages.push(`   \u2022 ${cycle}`);
      });
    }
    return { messages };
  }
  /** The blocked_by / blocks entry shape: number plus the target's feature and title. */
  async describeTicket(ticketNumber) {
    const path4 = await this.finder.findTicketFile(ticketNumber);
    if (!path4)
      return null;
    const ticket = await this.fs.readTicket(path4);
    return { ticket: ticketNumber, feature: ticket.feature, description: ticket.title };
  }
  async readAllTickets() {
    const paths = await this.fs.findTickets();
    return Promise.all(paths.map((path4) => this.fs.readTicket(path4)));
  }
};
function createDependencyOperations(dataDir) {
  return new DependencyOperations(dataDir);
}

// ../shared/dist/analytics-operations.js
var ANALYTICS_REPORT_TYPES = [
  "timeTracking",
  "featureProgress",
  "cost",
  "rework"
];
var REMOVED_REPORT_TYPES = ["velocity", "burndown", "workload", "completion"];
var REPORT_TITLES = {
  timeTracking: "Time Tracking Report",
  featureProgress: "Feature Progress Report",
  cost: "Cost Report",
  rework: "Rework Report"
};
function buildAnalyticsReport(reportType, tickets, filters = {}) {
  if (REMOVED_REPORT_TYPES.includes(reportType)) {
    throw new Error(`Report type '${reportType}' was removed in #263 when analytics was rebuilt around cost and rework instead of sprint metrics. Available reports: ${ANALYTICS_REPORT_TYPES.join(", ")}`);
  }
  if (!ANALYTICS_REPORT_TYPES.includes(reportType)) {
    throw new Error(`Unknown report type: ${reportType}. Available reports: ${ANALYTICS_REPORT_TYPES.join(", ")}`);
  }
  const type2 = reportType;
  const filtered = AnalyticsService.filterTickets(tickets, filters);
  const data = type2 === "timeTracking" ? AnalyticsService.generateTimeTrackingReport(filtered) : type2 === "featureProgress" ? AnalyticsService.generateFeatureProgressReport(filtered) : type2 === "cost" ? AnalyticsService.generateCostReport(filtered) : AnalyticsService.generateReworkReport(filtered);
  return {
    title: REPORT_TITLES[type2],
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    data
  };
}
function formatAnalyticsReport(report, format = "summary") {
  if (format === "json") {
    return formatJSON({
      title: report.title,
      generatedAt: report.generatedAt,
      data: report.data
    });
  }
  if (format === "csv" && report.data.length > 0) {
    const columns = Object.keys(report.data[0]).map((key) => ({
      key,
      header: humanLabel(key),
      width: 0,
      formatter: (value) => String(value)
    }));
    return formatCSV(report.data, columns);
  }
  const lines = [`
\u{1F4CA} ${report.title}`, "=".repeat(50)];
  if (report.data.length === 0) {
    lines.push("No data available for the specified filters and time range.");
    return lines.join("\n");
  }
  report.data.forEach((item, index) => {
    if (index > 0)
      lines.push("");
    Object.entries(item).forEach(([key, value]) => {
      const label = humanLabel(key);
      if (Array.isArray(value)) {
        lines.push(`${label}: ${value.join(", ")}`);
      } else if (typeof value === "number" && key.includes("Percentage")) {
        lines.push(`${label}: ${value}%`);
      } else if (typeof value === "number" && key.includes("Minutes")) {
        const hours = Math.floor(value / 60);
        const minutes = value % 60;
        lines.push(`${label}: ${hours}h ${minutes}m`);
      } else {
        lines.push(`${label}: ${value}`);
      }
    });
  });
  lines.push("\n" + "=".repeat(50));
  return lines.join("\n");
}
function humanLabel(key) {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1").trim();
}
async function runAnalyticsReport(dataDir, options) {
  const fs3 = new TrackerFileSystem(dataDir);
  const paths = await fs3.findTickets();
  const tickets = await Promise.all(paths.map((path4) => fs3.readTicket(path4)));
  const report = buildAnalyticsReport(options.reportType, tickets, options.filters ?? {});
  return { messages: [formatAnalyticsReport(report, options.format ?? "summary")] };
}

// src/config/config.ts
import { existsSync as existsSync2, readFileSync as readFileSync3 } from "fs";
import { resolve as resolve3 } from "path";

// src/config/schema.ts
var LogLevelSchema = external_exports.enum(["debug", "info", "warn", "error"]);
var LogFormatSchema = external_exports.enum(["json", "text"]);
var LogOutputSchema = external_exports.enum(["console", "file", "both"]);
var EnvironmentSchema = external_exports.enum(["development", "production", "test"]);
var ServerConfigSchema = external_exports.object({
  name: external_exports.string().min(1, "Server name is required"),
  version: external_exports.string().min(1, "Server version is required"),
  port: external_exports.number().int().positive().optional(),
  timeout: external_exports.number().int().positive().default(3e4)
  // 30 seconds
});
var TokenTrackingConfigSchema = external_exports.object({
  enabled: external_exports.boolean().default(false),
  claudeDataPath: external_exports.string().optional().describe("Path to Claude usage data directory"),
  autoTrackSessions: external_exports.boolean().default(true).describe("Automatically track token usage for work sessions"),
  reportingInterval: external_exports.number().int().positive().default(36e5).describe("Token reporting interval in ms (default: 1 hour)")
});
var TrackerConfigSchema = external_exports.object({
  dataDir: external_exports.string().min(1, "Data directory is required"),
  maxFileWatchers: external_exports.number().int().positive().default(100),
  scriptTimeout: external_exports.number().int().positive().default(3e4),
  // 30 seconds
  scriptPath: external_exports.string().optional(),
  tokenTracking: TokenTrackingConfigSchema.default({})
});
var LoggingConfigSchema = external_exports.object({
  level: LogLevelSchema.default("info"),
  format: LogFormatSchema.default("text"),
  output: LogOutputSchema.default("console"),
  fileDir: external_exports.string().optional(),
  maxFiles: external_exports.number().int().positive().default(5),
  maxSize: external_exports.string().default("10MB")
});
var MonitoringConfigSchema = external_exports.object({
  healthCheck: external_exports.boolean().default(true),
  healthCheckPort: external_exports.number().int().positive().optional(),
  metricsEnabled: external_exports.boolean().default(false),
  memoryThreshold: external_exports.number().positive().default(1024),
  // MB
  diskThreshold: external_exports.number().positive().default(1024),
  // MB
  responseTimeThreshold: external_exports.number().positive().default(5e3)
  // ms
});
var SecurityConfigSchema = external_exports.object({
  enableAuth: external_exports.boolean().default(false),
  authToken: external_exports.string().optional(),
  allowedOrigins: external_exports.array(external_exports.string()).default([]),
  rateLimitEnabled: external_exports.boolean().default(false),
  maxRequestsPerMinute: external_exports.number().int().positive().default(60)
});
var MCPServerConfigSchema = external_exports.object({
  environment: EnvironmentSchema.default("development"),
  server: ServerConfigSchema,
  tracker: TrackerConfigSchema,
  logging: LoggingConfigSchema.default({}),
  monitoring: MonitoringConfigSchema.default({}),
  security: SecurityConfigSchema.default({})
});

// src/config/defaults.ts
var DEFAULT_CONFIG = {
  environment: "development",
  server: {
    name: "tracker-mcp",
    version: "1.0.0",
    timeout: 3e4
    // 30 seconds
  },
  tracker: {
    dataDir: "./plan/tracker-data",
    maxFileWatchers: 100,
    scriptTimeout: 3e4,
    // 30 seconds
    scriptPath: "./packages/scripts/dist",
    tokenTracking: {
      enabled: true,
      autoTrackSessions: true,
      reportingInterval: 36e5
      // 1 hour
    }
  },
  logging: {
    level: "info",
    format: "text",
    output: "console",
    maxFiles: 5,
    maxSize: "10MB"
  },
  monitoring: {
    healthCheck: true,
    metricsEnabled: false,
    memoryThreshold: 1024,
    // 1GB
    diskThreshold: 1024,
    // 1GB
    responseTimeThreshold: 5e3
    // 5 seconds
  },
  security: {
    enableAuth: false,
    allowedOrigins: [],
    rateLimitEnabled: false,
    maxRequestsPerMinute: 60
  }
};
var ENVIRONMENT_OVERRIDES = {
  development: {
    logging: {
      level: "debug",
      format: "text",
      output: "console",
      maxFiles: 5,
      maxSize: "10MB"
    },
    monitoring: {
      healthCheck: true,
      metricsEnabled: true,
      memoryThreshold: 1024,
      diskThreshold: 1024,
      responseTimeThreshold: 5e3
    },
    security: {
      enableAuth: false,
      rateLimitEnabled: false,
      allowedOrigins: [],
      maxRequestsPerMinute: 60
    }
  },
  production: {
    logging: {
      level: "info",
      format: "json",
      output: "both",
      fileDir: "./logs",
      maxFiles: 5,
      maxSize: "10MB"
    },
    monitoring: {
      healthCheck: true,
      metricsEnabled: true,
      memoryThreshold: 2048,
      // 2GB for production
      diskThreshold: 5120,
      // 5GB for production
      responseTimeThreshold: 5e3
    },
    security: {
      enableAuth: true,
      rateLimitEnabled: true,
      maxRequestsPerMinute: 100,
      allowedOrigins: []
    }
  },
  test: {
    logging: {
      level: "warn",
      format: "text",
      output: "console",
      maxFiles: 5,
      maxSize: "10MB"
    },
    monitoring: {
      healthCheck: false,
      metricsEnabled: false,
      memoryThreshold: 1024,
      diskThreshold: 1024,
      responseTimeThreshold: 5e3
    },
    security: {
      enableAuth: false,
      rateLimitEnabled: false,
      allowedOrigins: [],
      maxRequestsPerMinute: 60
    },
    tracker: {
      dataDir: "./test-data",
      maxFileWatchers: 100,
      scriptTimeout: 1e4,
      // Faster timeouts for tests
      tokenTracking: {
        enabled: false,
        // Disabled for tests
        autoTrackSessions: false,
        reportingInterval: 6e4
        // Faster interval for tests
      }
    }
  }
};
function getDefaultConfig(environment = "development") {
  const envOverrides = ENVIRONMENT_OVERRIDES[environment] || {};
  return {
    ...DEFAULT_CONFIG,
    environment,
    server: {
      ...DEFAULT_CONFIG.server,
      ...envOverrides.server
    },
    tracker: {
      ...DEFAULT_CONFIG.tracker,
      ...envOverrides.tracker
    },
    logging: {
      ...DEFAULT_CONFIG.logging,
      ...envOverrides.logging
    },
    monitoring: {
      ...DEFAULT_CONFIG.monitoring,
      ...envOverrides.monitoring
    },
    security: {
      ...DEFAULT_CONFIG.security,
      ...envOverrides.security
    }
  };
}

// src/config/env.ts
var ENV_MAPPINGS = {
  // Environment
  NODE_ENV: "environment",
  // Server configuration
  MCP_SERVER_NAME: "server.name",
  MCP_SERVER_VERSION: "server.version",
  MCP_SERVER_PORT: "server.port",
  MCP_SERVER_TIMEOUT: "server.timeout",
  // Tracker configuration
  MCP_DATA_DIR: "tracker.dataDir",
  MCP_MAX_FILE_WATCHERS: "tracker.maxFileWatchers",
  MCP_SCRIPT_TIMEOUT: "tracker.scriptTimeout",
  MCP_SCRIPT_PATH: "tracker.scriptPath",
  // Logging configuration
  MCP_LOG_LEVEL: "logging.level",
  MCP_LOG_FORMAT: "logging.format",
  MCP_LOG_OUTPUT: "logging.output",
  MCP_LOG_FILE_DIR: "logging.fileDir",
  MCP_LOG_MAX_FILES: "logging.maxFiles",
  MCP_LOG_MAX_SIZE: "logging.maxSize",
  // Monitoring configuration
  MCP_HEALTH_CHECK: "monitoring.healthCheck",
  MCP_HEALTH_CHECK_PORT: "monitoring.healthCheckPort",
  MCP_METRICS_ENABLED: "monitoring.metricsEnabled",
  MCP_MEMORY_THRESHOLD: "monitoring.memoryThreshold",
  MCP_DISK_THRESHOLD: "monitoring.diskThreshold",
  MCP_RESPONSE_TIME_THRESHOLD: "monitoring.responseTimeThreshold",
  // Security configuration
  MCP_ENABLE_AUTH: "security.enableAuth",
  MCP_AUTH_TOKEN: "security.authToken",
  MCP_ALLOWED_ORIGINS: "security.allowedOrigins",
  MCP_RATE_LIMIT_ENABLED: "security.rateLimitEnabled",
  MCP_MAX_REQUESTS_PER_MINUTE: "security.maxRequestsPerMinute"
};
var typeConverters = {
  string: (value) => value,
  number: (value) => {
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Invalid number: ${value}`);
    }
    return num;
  },
  boolean: (value) => {
    const lower = value.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "no") return false;
    throw new Error(`Invalid boolean: ${value}`);
  },
  array: (value) => {
    return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  }
};
function setNestedProperty(obj, path4, value) {
  const keys = path4.split(".");
  let current = obj;
  for (let i2 = 0; i2 < keys.length - 1; i2++) {
    const key = keys[i2];
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }
  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}
function convertValue(path4, value) {
  if (path4.includes("port") || path4.includes("timeout") || path4.includes("threshold") || path4.includes("maxFiles") || path4.includes("maxRequestsPerMinute") || path4.includes("maxFileWatchers")) {
    return typeConverters.number(value);
  }
  if (path4.includes("healthCheck") || path4.includes("metricsEnabled") || path4.includes("enableAuth") || path4.includes("rateLimitEnabled")) {
    return typeConverters.boolean(value);
  }
  if (path4.includes("allowedOrigins")) {
    return typeConverters.array(value);
  }
  return typeConverters.string(value);
}
function loadFromEnvironment() {
  const config2 = {};
  for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
    const value = process.env[envVar];
    if (value !== void 0) {
      try {
        const convertedValue = convertValue(configPath, value);
        setNestedProperty(config2, configPath, convertedValue);
      } catch (error) {
        console.warn(`Warning: Invalid value for ${envVar}: ${value} (${error.message})`);
      }
    }
  }
  return config2;
}
function validateRequiredEnvVars() {
  const required = [
    // Add any required environment variables here
    // 'MCP_AUTH_TOKEN', // Example: only required if auth is enabled
  ];
  const missing = [];
  for (const envVar of required) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
function getEnvironment() {
  return process.env.NODE_ENV || process.env.MCP_ENV || "development";
}

// src/config/config.ts
var CONFIG_FILE_LOCATIONS = [
  "./mcp-server.config.json",
  "./config/mcp-server.json",
  "./packages/mcp-server/config.json",
  process.env.MCP_CONFIG_FILE
].filter(Boolean);
function loadFromFile(filePath) {
  try {
    const resolvedPath = resolve3(filePath);
    if (!existsSync2(resolvedPath)) {
      return {};
    }
    const content = readFileSync3(resolvedPath, "utf-8");
    const parsed = JSON.parse(content);
    console.error(`\u2705 Loaded configuration from: ${resolvedPath}`);
    return parsed;
  } catch (error) {
    console.warn(`\u26A0\uFE0F  Failed to load config from ${filePath}:`, error.message);
    return {};
  }
}
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];
    if (sourceValue !== void 0) {
      if (typeof sourceValue === "object" && sourceValue !== null && !Array.isArray(sourceValue) && typeof targetValue === "object" && targetValue !== null && !Array.isArray(targetValue)) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue;
      }
    }
  }
  return result;
}
function loadConfig() {
  const environment = getEnvironment();
  console.error(`\u{1F527} Loading MCP server configuration for environment: ${environment}`);
  let config2 = getDefaultConfig(environment);
  for (const filePath of CONFIG_FILE_LOCATIONS) {
    const fileConfig = loadFromFile(filePath);
    if (Object.keys(fileConfig).length > 0) {
      config2 = deepMerge(config2, fileConfig);
      break;
    }
  }
  const envConfig = loadFromEnvironment();
  if (Object.keys(envConfig).length > 0) {
    console.error(`\u{1F30D} Applied environment variable overrides`);
    config2 = deepMerge(config2, envConfig);
  }
  try {
    validateRequiredEnvVars();
  } catch (error) {
    console.error("\u274C Configuration validation failed:", error.message);
    process.exit(1);
  }
  try {
    const validatedConfig = MCPServerConfigSchema.parse(config2);
    console.error("\u2705 Configuration validation successful");
    console.error("\u{1F4CB} Configuration Summary:");
    console.error(`   Environment: ${validatedConfig.environment}`);
    console.error(`   Server: ${validatedConfig.server.name} v${validatedConfig.server.version}`);
    console.error(`   Data Directory: ${validatedConfig.tracker.dataDir}`);
    console.error(`   Log Level: ${validatedConfig.logging.level}`);
    console.error(`   Health Check: ${validatedConfig.monitoring.healthCheck}`);
    console.error(`   Auth Enabled: ${validatedConfig.security.enableAuth}`);
    return validatedConfig;
  } catch (error) {
    console.error("\u274C Configuration validation failed:");
    if (error.errors) {
      error.errors.forEach((err) => {
        console.error(`   ${err.path.join(".")}: ${err.message}`);
      });
    } else {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  }
}
var ConfigManager = class _ConfigManager {
  static instance;
  config;
  constructor() {
    this.config = loadConfig();
  }
  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!_ConfigManager.instance) {
      _ConfigManager.instance = new _ConfigManager();
    }
    return _ConfigManager.instance;
  }
  /**
   * Get full configuration
   */
  getConfig() {
    return { ...this.config };
  }
  /**
   * Get server configuration
   */
  getServerConfig() {
    return { ...this.config.server };
  }
  /**
   * Get tracker configuration
   */
  getTrackerConfig() {
    return { ...this.config.tracker };
  }
  /**
   * Get logging configuration
   */
  getLoggingConfig() {
    return { ...this.config.logging };
  }
  /**
   * Get monitoring configuration
   */
  getMonitoringConfig() {
    return { ...this.config.monitoring };
  }
  /**
   * Get security configuration
   */
  getSecurityConfig() {
    return { ...this.config.security };
  }
  /**
   * Check if feature is enabled
   */
  isHealthCheckEnabled() {
    return this.config.monitoring.healthCheck;
  }
  isMetricsEnabled() {
    return this.config.monitoring.metricsEnabled;
  }
  isAuthEnabled() {
    return this.config.security.enableAuth;
  }
  isRateLimitEnabled() {
    return this.config.security.rateLimitEnabled;
  }
  /**
   * Get environment info
   */
  getEnvironment() {
    return this.config.environment;
  }
  isProduction() {
    return this.config.environment === "production";
  }
  isDevelopment() {
    return this.config.environment === "development";
  }
  isTest() {
    return this.config.environment === "test";
  }
  /**
   * Reload configuration (for testing purposes)
   */
  reload() {
    this.config = loadConfig();
  }
};
function getConfigManager() {
  return ConfigManager.getInstance();
}

// src/monitoring/health.ts
import { existsSync as existsSync3, statSync as statSync2 } from "fs";
var HealthManager = class {
  config = getConfigManager();
  startTime = Date.now();
  lastChecks = {};
  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const serverConfig2 = this.config.getServerConfig();
    const trackerConfig2 = this.config.getTrackerConfig();
    const monitoringConfig = this.config.getMonitoringConfig();
    const checks = {};
    const dataCheckStart = Date.now();
    try {
      if (existsSync3(trackerConfig2.dataDir)) {
        const stats = statSync2(trackerConfig2.dataDir);
        if (stats.isDirectory()) {
          checks.dataDirectory = {
            status: "pass",
            message: `Data directory accessible: ${trackerConfig2.dataDir}`,
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            responseTime: Date.now() - dataCheckStart
          };
        } else {
          checks.dataDirectory = {
            status: "fail",
            message: `Data directory path is not a directory: ${trackerConfig2.dataDir}`,
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            responseTime: Date.now() - dataCheckStart
          };
        }
      } else {
        checks.dataDirectory = {
          status: "fail",
          message: `Data directory does not exist: ${trackerConfig2.dataDir}`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          responseTime: Date.now() - dataCheckStart
        };
      }
    } catch (error) {
      checks.dataDirectory = {
        status: "fail",
        message: `Data directory check failed: ${error.message}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        responseTime: Date.now() - dataCheckStart
      };
    }
    const memoryCheckStart = Date.now();
    try {
      const memoryUsage = process.memoryUsage();
      const memoryUsedMB = memoryUsage.rss / 1024 / 1024;
      const memoryThreshold = monitoringConfig.memoryThreshold;
      if (memoryUsedMB < memoryThreshold * 0.8) {
        checks.memory = {
          status: "pass",
          message: `Memory usage: ${memoryUsedMB.toFixed(1)}MB (threshold: ${memoryThreshold}MB)`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          responseTime: Date.now() - memoryCheckStart
        };
      } else if (memoryUsedMB < memoryThreshold) {
        checks.memory = {
          status: "warn",
          message: `Memory usage approaching threshold: ${memoryUsedMB.toFixed(1)}MB (threshold: ${memoryThreshold}MB)`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          responseTime: Date.now() - memoryCheckStart
        };
      } else {
        checks.memory = {
          status: "fail",
          message: `Memory usage exceeds threshold: ${memoryUsedMB.toFixed(1)}MB (threshold: ${memoryThreshold}MB)`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          responseTime: Date.now() - memoryCheckStart
        };
      }
    } catch (error) {
      checks.memory = {
        status: "fail",
        message: `Memory check failed: ${error.message}`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        responseTime: Date.now() - memoryCheckStart
      };
    }
    const responseTimeCheckStart = Date.now();
    const responseTime = Date.now() - responseTimeCheckStart;
    const responseTimeThreshold = monitoringConfig.responseTimeThreshold;
    if (responseTime < responseTimeThreshold * 0.5) {
      checks.responseTime = {
        status: "pass",
        message: `Response time: ${responseTime}ms (threshold: ${responseTimeThreshold}ms)`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        responseTime
      };
    } else if (responseTime < responseTimeThreshold) {
      checks.responseTime = {
        status: "warn",
        message: `Response time elevated: ${responseTime}ms (threshold: ${responseTimeThreshold}ms)`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        responseTime
      };
    } else {
      checks.responseTime = {
        status: "fail",
        message: `Response time exceeds threshold: ${responseTime}ms (threshold: ${responseTimeThreshold}ms)`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        responseTime
      };
    }
    const failedChecks = Object.values(checks).filter((check) => check.status === "fail");
    const warnChecks = Object.values(checks).filter((check) => check.status === "warn");
    let overallStatus;
    if (failedChecks.length > 0) {
      overallStatus = "unhealthy";
    } else if (warnChecks.length > 0) {
      overallStatus = "degraded";
    } else {
      overallStatus = "healthy";
    }
    this.lastChecks = checks;
    return {
      status: overallStatus,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1e3),
      checks,
      version: serverConfig2.version,
      environment: this.config.getEnvironment()
    };
  }
  /**
   * Get system metrics
   */
  getSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    return {
      memory: {
        used: memoryUsage.rss,
        total: memoryUsage.rss + memoryUsage.heapTotal,
        percentage: memoryUsage.rss / (memoryUsage.rss + memoryUsage.heapTotal) * 100
      },
      disk: {
        available: 0,
        // Would need additional library for disk usage
        used: 0,
        total: 0,
        percentage: 0
      },
      uptime: Math.floor((Date.now() - this.startTime) / 1e3),
      pid: process.pid,
      nodeVersion: process.version
    };
  }
  /**
   * Get last health check results
   */
  getLastHealthCheck() {
    return { ...this.lastChecks };
  }
  /**
   * Check if server is ready to receive requests
   */
  async isReady() {
    const health = await this.performHealthCheck();
    return health.status !== "unhealthy";
  }
  /**
   * Check if server is alive (basic liveness check)
   */
  isAlive() {
    return true;
  }
};

// src/monitoring/logger.ts
import { writeFileSync as writeFileSync3, existsSync as existsSync4, mkdirSync, readdirSync as readdirSync2, unlinkSync as unlinkSync3, statSync as statSync3 } from "fs";
import { join as join7 } from "path";
var Logger = class _Logger {
  constructor(component) {
    this.component = component;
    this.initializeFileLogging();
  }
  component;
  config = getConfigManager();
  logConfig = this.config.getLoggingConfig();
  /**
   * Initialize file logging if configured
   */
  initializeFileLogging() {
    if (this.logConfig.output === "file" || this.logConfig.output === "both") {
      if (this.logConfig.fileDir) {
        try {
          if (!existsSync4(this.logConfig.fileDir)) {
            mkdirSync(this.logConfig.fileDir, { recursive: true });
          }
          this.cleanupOldLogFiles();
        } catch (error) {
          console.error("Failed to initialize file logging:", error);
        }
      }
    }
  }
  /**
   * Clean up old log files based on maxFiles configuration
   */
  cleanupOldLogFiles() {
    if (!this.logConfig.fileDir) return;
    try {
      const files = readdirSync2(this.logConfig.fileDir).filter((file) => file.endsWith(".log")).map((file) => ({
        name: file,
        path: join7(this.logConfig.fileDir, file),
        mtime: statSync3(join7(this.logConfig.fileDir, file)).mtime
      })).sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      if (files.length > this.logConfig.maxFiles) {
        const filesToDelete = files.slice(this.logConfig.maxFiles);
        filesToDelete.forEach((file) => {
          try {
            unlinkSync3(file.path);
          } catch (error) {
            console.error(`Failed to delete old log file ${file.name}:`, error);
          }
        });
      }
    } catch (error) {
      console.error("Failed to cleanup old log files:", error);
    }
  }
  /**
   * Get log file path for current date
   */
  getLogFilePath() {
    if (!this.logConfig.fileDir) {
      throw new Error("File logging is not configured");
    }
    const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const filename = `mcp-server-${date}.log`;
    return join7(this.logConfig.fileDir, filename);
  }
  /**
   * Format log entry based on configuration
   */
  formatLogEntry(entry) {
    if (this.logConfig.format === "json") {
      return JSON.stringify(entry);
    }
    const timestamp2 = entry.timestamp;
    const level = entry.level.toUpperCase().padEnd(5);
    const component = entry.component ? `[${entry.component}]` : "";
    const message = entry.message;
    const duration = entry.duration ? ` (${entry.duration}ms)` : "";
    let formatted = `${timestamp2} ${level} ${component} ${message}${duration}`;
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      formatted += ` | ${JSON.stringify(entry.metadata)}`;
    }
    if (entry.error) {
      formatted += `
Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        formatted += `
Stack: ${entry.error.stack}`;
      }
    }
    return formatted;
  }
  /**
   * Write log entry to configured outputs
   */
  writeLog(entry) {
    const formattedEntry = this.formatLogEntry(entry);
    if (this.logConfig.output === "console" || this.logConfig.output === "both") {
      console.error(formattedEntry);
    }
    if (this.logConfig.output === "file" || this.logConfig.output === "both") {
      try {
        const logFilePath = this.getLogFilePath();
        const logLine = formattedEntry + "\n";
        writeFileSync3(logFilePath, logLine, { flag: "a" });
      } catch (error) {
        console.error("Failed to write to log file:", error);
      }
    }
  }
  /**
   * Check if log level should be written
   */
  shouldLog(level) {
    const levels = ["debug", "info", "warn", "error"];
    const configLevel = this.logConfig.level;
    const configIndex = levels.indexOf(configLevel);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= configIndex;
  }
  /**
   * Create log entry
   */
  createLogEntry(level, message, metadata, error, duration, requestId) {
    return {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      message,
      component: this.component,
      metadata,
      requestId,
      duration,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : void 0
    };
  }
  /**
   * Log debug message
   */
  debug(message, metadata, requestId) {
    if (this.shouldLog("debug")) {
      const entry = this.createLogEntry("debug", message, metadata, void 0, void 0, requestId);
      this.writeLog(entry);
    }
  }
  /**
   * Log info message
   */
  info(message, metadata, requestId) {
    if (this.shouldLog("info")) {
      const entry = this.createLogEntry("info", message, metadata, void 0, void 0, requestId);
      this.writeLog(entry);
    }
  }
  /**
   * Log warning message
   */
  warn(message, metadata, requestId) {
    if (this.shouldLog("warn")) {
      const entry = this.createLogEntry("warn", message, metadata, void 0, void 0, requestId);
      this.writeLog(entry);
    }
  }
  /**
   * Log error message
   */
  error(message, error, metadata, requestId) {
    if (this.shouldLog("error")) {
      const entry = this.createLogEntry("error", message, metadata, error, void 0, requestId);
      this.writeLog(entry);
    }
  }
  /**
   * Log with performance timing
   */
  timed(level, message, duration, metadata, requestId) {
    if (this.shouldLog(level)) {
      const entry = this.createLogEntry(level, message, metadata, void 0, duration, requestId);
      this.writeLog(entry);
    }
  }
  /**
   * Create child logger with additional component context
   */
  child(component) {
    const childComponent = this.component ? `${this.component}.${component}` : component;
    return new _Logger(childComponent);
  }
};
var logger = new Logger("mcp-server");

// src/monitoring/process.ts
import { EventEmitter } from "events";
var ProcessManager = class extends EventEmitter {
  config = getConfigManager();
  health = new HealthManager();
  isShuttingDown = false;
  shutdownTimeout;
  processLogger = logger.child("process");
  cleanupHandlers = [];
  constructor() {
    super();
    this.setupSignalHandlers();
    this.setupUncaughtExceptionHandlers();
    this.startHealthChecks();
  }
  /**
   * Setup signal handlers for graceful shutdown
   */
  setupSignalHandlers() {
    const signals = ["SIGTERM", "SIGINT", "SIGHUP"];
    signals.forEach((signal) => {
      process.on(signal, () => {
        this.processLogger.info(`Received ${signal} signal, initiating graceful shutdown`);
        this.gracefulShutdown(signal);
      });
    });
  }
  /**
   * Setup uncaught exception handlers
   */
  setupUncaughtExceptionHandlers() {
    process.on("uncaughtException", (error) => {
      this.processLogger.error("Uncaught exception", error, {
        stack: error.stack,
        pid: process.pid
      });
      this.emit("error", error);
      setTimeout(() => {
        process.exit(1);
      }, 5e3);
    });
    process.on("unhandledRejection", (reason, promise) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.processLogger.error("Unhandled promise rejection", error, {
        promise: promise.toString(),
        pid: process.pid
      });
      this.emit("error", error);
    });
  }
  /**
   * Start periodic health checks if enabled
   */
  startHealthChecks() {
    const monitoringConfig = this.config.getMonitoringConfig();
    if (monitoringConfig.healthCheck) {
      this.health.performHealthCheck().then((result) => {
        this.processLogger.info("Initial health check completed", {
          status: result.status,
          uptime: result.uptime
        });
        if (result.status !== "unhealthy") {
          this.emit("ready");
        }
      }).catch((error) => {
        this.processLogger.error("Initial health check failed", error);
        this.emit("error", error);
      });
      if (monitoringConfig.metricsEnabled) {
        setInterval(async () => {
          if (!this.isShuttingDown) {
            try {
              const result = await this.health.performHealthCheck();
              this.processLogger.debug("Periodic health check completed", {
                status: result.status,
                uptime: result.uptime
              });
              if (result.status === "unhealthy") {
                this.processLogger.warn("Health check indicates unhealthy status", {
                  checks: result.checks
                });
              }
            } catch (error) {
              this.processLogger.error("Periodic health check failed", error);
            }
          }
        }, 3e4);
      }
    } else {
      setImmediate(() => {
        this.emit("ready");
      });
    }
  }
  /**
   * Register cleanup handler
   */
  registerCleanupHandler(handler) {
    this.cleanupHandlers.push(handler);
  }
  /**
   * Perform graceful shutdown
   */
  async gracefulShutdown(signal) {
    if (this.isShuttingDown) {
      try {
        this.processLogger.warn("Repeat signal during shutdown, forcing exit", { signal });
      } catch {
      }
      process.exit(1);
    }
    this.isShuttingDown = true;
    this.emit("shutdown", signal);
    const shutdownTimeout = this.config.getServerConfig().timeout || 3e4;
    this.shutdownTimeout = setTimeout(() => {
      this.processLogger.error("Graceful shutdown timeout exceeded, forcing exit");
      process.exit(1);
    }, shutdownTimeout);
    try {
      this.processLogger.info("Starting graceful shutdown process", {
        signal,
        pid: process.pid,
        uptime: process.uptime()
      });
      await this.executeCleanupHandlers();
      this.processLogger.info("Graceful shutdown completed successfully");
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
      }
      process.exit(0);
    } catch (error) {
      this.processLogger.error("Error during graceful shutdown", error);
      process.exit(1);
    }
  }
  /**
   * Execute all cleanup handlers
   */
  async executeCleanupHandlers() {
    this.processLogger.info(`Executing ${this.cleanupHandlers.length} cleanup handlers`);
    const promises = this.cleanupHandlers.map(async (handler, index) => {
      try {
        const result = handler();
        if (result instanceof Promise) {
          await result;
        }
        this.processLogger.debug(`Cleanup handler ${index + 1} completed`);
      } catch (error) {
        this.processLogger.error(`Cleanup handler ${index + 1} failed`, error);
      }
    });
    await Promise.allSettled(promises);
    this.processLogger.info("All cleanup handlers executed");
  }
  /**
   * Get current process metrics
   */
  getProcessMetrics() {
    return {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.version,
      platform: process.platform,
      arch: process.arch
    };
  }
  /**
   * Get health status
   */
  async getHealthStatus() {
    return this.health.performHealthCheck();
  }
  /**
   * Check if process is ready
   */
  async isReady() {
    return this.health.isReady();
  }
  /**
   * Check if process is alive
   */
  isAlive() {
    return !this.isShuttingDown && this.health.isAlive();
  }
  /**
   * Force shutdown (for testing purposes)
   */
  forceShutdown(exitCode = 0) {
    this.processLogger.warn("Force shutdown requested", { exitCode });
    if (this.shutdownTimeout) {
      clearTimeout(this.shutdownTimeout);
    }
    process.exit(exitCode);
  }
};

// src/monitoring/exit-recorder.ts
import { appendFileSync as appendFileSync2, mkdirSync as mkdirSync2 } from "fs";
import { dirname as dirname2, join as join8 } from "path";
var EXIT_LOG_FILENAME = ".mcp-exits.jsonl";
var ExitRecorder = class {
  logPath;
  startedAt = Date.now();
  installed = false;
  /** Guards against double-recording when a signal handler also triggers 'exit'. */
  terminalRecorded = false;
  /** Write failures are counted rather than logged — see the catch in record(). */
  writeFailures = 0;
  lastWriteError;
  constructor(dataDir, filename = EXIT_LOG_FILENAME) {
    this.logPath = join8(dataDir, filename);
  }
  uptimeSeconds() {
    return Math.round((Date.now() - this.startedAt) / 1e3);
  }
  /**
   * Appends one JSON line. Never throws: instrumentation must not be the thing
   * that takes the server down, and this runs on paths where the process is
   * already dying.
   */
  record(event, detail = {}) {
    const entry = {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      pid: process.pid,
      event,
      uptime_s: this.uptimeSeconds(),
      ...detail
    };
    try {
      mkdirSync2(dirname2(this.logPath), { recursive: true });
      appendFileSync2(this.logPath, JSON.stringify(entry) + "\n");
    } catch (error) {
      this.writeFailures += 1;
      this.lastWriteError = error instanceof Error ? error.message : String(error);
    }
  }
  /** Number of records that could not be written. 0 means the log is trustworthy. */
  getWriteFailures() {
    return this.writeFailures;
  }
  /** Message from the most recent write failure, if any. */
  getLastWriteError() {
    return this.lastWriteError;
  }
  recordTerminal(event, detail = {}) {
    if (this.terminalRecorded) return;
    this.terminalRecorded = true;
    this.record(event, { ...detail, terminal: true });
  }
  /**
   * Registers handlers on every exit path Node can observe.
   *
   * These are additive: the existing ProcessManager handlers keep running and
   * keep doing the graceful shutdown. This only ensures the reason is written
   * somewhere that survives.
   */
  install() {
    if (this.installed) return;
    this.installed = true;
    for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
      process.on(signal, () => {
        this.recordTerminal("signal", { signal });
      });
    }
    process.on("uncaughtException", (error) => {
      this.recordTerminal("uncaught-exception", {
        message: error.message,
        stack: error.stack
      });
    });
    process.on("unhandledRejection", (reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.record("unhandled-rejection", {
        message: error.message,
        stack: error.stack,
        terminal: false
      });
    });
    process.on("exit", (code) => {
      this.recordTerminal("process-exit", { code });
    });
  }
  /** Call once the server is actually serving. */
  recordStartup(detail = {}) {
    this.record("startup", detail);
  }
};

// src/monitoring/metrics.ts
import { EventEmitter as EventEmitter2 } from "events";
var MetricsCollector = class extends EventEmitter2 {
  config = getConfigManager();
  metricsLogger = logger.child("metrics");
  metrics = /* @__PURE__ */ new Map();
  requestDurations = [];
  requestCount = 0;
  errorCount = 0;
  startTime = Date.now();
  isCollecting = false;
  constructor() {
    super();
    this.startCollection();
  }
  /**
   * Start metrics collection if enabled
   */
  startCollection() {
    const monitoringConfig = this.config.getMonitoringConfig();
    if (monitoringConfig.metricsEnabled) {
      this.isCollecting = true;
      this.metricsLogger.info("Metrics collection started");
      setInterval(() => {
        this.collectSystemMetrics();
      }, 1e4);
      setInterval(() => {
        this.cleanupOldMetrics();
      }, 3e5);
    } else {
      this.metricsLogger.debug("Metrics collection disabled");
    }
  }
  /**
   * Record a metric value
   */
  recordMetric(name, value, labels) {
    if (!this.isCollecting) return;
    const entry = {
      timestamp: Date.now(),
      value,
      labels
    };
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    const metricHistory = this.metrics.get(name);
    metricHistory.push(entry);
    if (metricHistory.length > 1e3) {
      metricHistory.shift();
    }
    this.metricsLogger.debug("Metric recorded", {
      name,
      value,
      labels,
      timestamp: entry.timestamp
    });
  }
  /**
   * Record request metrics
   */
  recordRequest(duration, success = true) {
    if (!this.isCollecting) return;
    this.requestCount++;
    this.requestDurations.push(duration);
    if (this.requestDurations.length > 1e3) {
      this.requestDurations.shift();
    }
    if (!success) {
      this.errorCount++;
    }
    this.recordMetric("request_duration_ms", duration);
    this.recordMetric("request_total", 1);
    if (!success) {
      this.recordMetric("request_errors_total", 1);
    }
  }
  /**
   * Get current performance metrics
   */
  getPerformanceMetrics() {
    const durations = this.requestDurations.slice().sort((a, b) => a - b);
    const errorRate = this.requestCount > 0 ? this.errorCount / this.requestCount * 100 : 0;
    const memoryUsage = process.memoryUsage();
    return {
      requestCount: this.requestCount,
      requestDuration: {
        min: durations.length > 0 ? durations[0] : 0,
        max: durations.length > 0 ? durations[durations.length - 1] : 0,
        avg: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        p50: this.percentile(durations, 0.5),
        p95: this.percentile(durations, 0.95),
        p99: this.percentile(durations, 0.99)
      },
      errorCount: this.errorCount,
      errorRate,
      memoryUsage: {
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external
      },
      uptime: Math.floor((Date.now() - this.startTime) / 1e3),
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Calculate percentile from sorted array
   */
  percentile(sortedArray, p) {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil(sortedArray.length * p) - 1;
    return sortedArray[Math.max(0, index)];
  }
  /**
   * Collect system metrics
   */
  collectSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    this.recordMetric("memory_rss_bytes", memoryUsage.rss);
    this.recordMetric("memory_heap_used_bytes", memoryUsage.heapUsed);
    this.recordMetric("memory_heap_total_bytes", memoryUsage.heapTotal);
    this.recordMetric("memory_external_bytes", memoryUsage.external);
    this.recordMetric("cpu_user_microseconds", cpuUsage.user);
    this.recordMetric("cpu_system_microseconds", cpuUsage.system);
    this.recordMetric("uptime_seconds", process.uptime());
    this.metricsLogger.debug("System metrics collected", {
      memory: memoryUsage,
      cpu: cpuUsage,
      uptime: process.uptime()
    });
  }
  /**
   * Clean up old metrics (older than 1 hour)
   */
  cleanupOldMetrics() {
    const cutoffTime = Date.now() - 60 * 60 * 1e3;
    let cleanedCount = 0;
    for (const [name, entries] of this.metrics) {
      const originalLength = entries.length;
      const filteredEntries = entries.filter((entry) => entry.timestamp > cutoffTime);
      if (filteredEntries.length !== originalLength) {
        this.metrics.set(name, filteredEntries);
        cleanedCount += originalLength - filteredEntries.length;
      }
    }
    if (cleanedCount > 0) {
      this.metricsLogger.debug("Cleaned up old metrics", { cleanedCount });
    }
  }
  /**
   * Get metric history
   */
  getMetricHistory(name, duration) {
    const entries = this.metrics.get(name) || [];
    if (duration) {
      const cutoffTime = Date.now() - duration;
      return entries.filter((entry) => entry.timestamp > cutoffTime);
    }
    return [...entries];
  }
  /**
   * Get all metric names
   */
  getMetricNames() {
    return Array.from(this.metrics.keys());
  }
  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.requestDurations = [];
    this.requestCount = 0;
    this.errorCount = 0;
    this.startTime = Date.now();
    this.metricsLogger.info("Metrics reset");
  }
  /**
   * Export metrics in Prometheus format (basic implementation)
   */
  exportPrometheusMetrics() {
    const lines = [];
    const timestamp2 = Date.now();
    lines.push(`# HELP request_total Total number of requests`);
    lines.push(`# TYPE request_total counter`);
    lines.push(`request_total ${this.requestCount} ${timestamp2}`);
    lines.push(`# HELP request_errors_total Total number of request errors`);
    lines.push(`# TYPE request_errors_total counter`);
    lines.push(`request_errors_total ${this.errorCount} ${timestamp2}`);
    const memoryUsage = process.memoryUsage();
    lines.push(`# HELP memory_rss_bytes Resident set size in bytes`);
    lines.push(`# TYPE memory_rss_bytes gauge`);
    lines.push(`memory_rss_bytes ${memoryUsage.rss} ${timestamp2}`);
    lines.push(`# HELP memory_heap_used_bytes Heap used in bytes`);
    lines.push(`# TYPE memory_heap_used_bytes gauge`);
    lines.push(`memory_heap_used_bytes ${memoryUsage.heapUsed} ${timestamp2}`);
    lines.push(`# HELP uptime_seconds Process uptime in seconds`);
    lines.push(`# TYPE uptime_seconds gauge`);
    lines.push(`uptime_seconds ${process.uptime()} ${timestamp2}`);
    return lines.join("\n") + "\n";
  }
};
var metricsCollector = new MetricsCollector();

// src/version-handshake.ts
var UNSTAMPED = "unknown";
var DEFAULT_TIMEOUT_MS = 2e3;
async function checkVersionSkew(options) {
  const {
    bundle,
    trackerUrl,
    strict = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch
  } = options;
  const base2 = {
    status: "unknown",
    shouldRefuse: false,
    bundleVersion: bundle.version,
    bundleCommit: bundle.gitCommit
  };
  const url = `${trackerUrl.replace(/\/+$/, "")}/api/version`;
  let payload;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) return { ...base2, status: "unreachable" };
    payload = await response.json();
  } catch {
    return { ...base2, status: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
  const trackerCommit = payload?.gitCommit;
  const trackerVersion = payload?.version;
  if (!trackerCommit || trackerCommit === UNSTAMPED || bundle.gitCommit === UNSTAMPED) {
    return { ...base2, status: "unknown", trackerVersion, trackerCommit };
  }
  if (trackerCommit === bundle.gitCommit) {
    return { ...base2, status: "match", trackerVersion, trackerCommit };
  }
  return {
    ...base2,
    status: "skew",
    shouldRefuse: strict,
    trackerVersion,
    trackerCommit
  };
}
function describeBundle(bundle) {
  return {
    version: bundle.version,
    commit: bundle.gitCommit,
    buildTime: bundle.buildTime,
    stamped: bundle.gitCommit !== UNSTAMPED
  };
}
function formatBundleLine(bundle) {
  const identity = describeBundle(bundle);
  if (!identity.stamped) {
    return "unstamped build (no commit recorded; version skew cannot be detected)";
  }
  return `${identity.version} (${identity.commit}), built ${identity.buildTime}`;
}
function formatSkewWarning(result) {
  if (result.status !== "skew") return [];
  return [
    "",
    "  \u26A0\uFE0F  VERSION SKEW: this MCP bundle and the tracker were built from different commits.",
    `     bundle:  ${result.bundleVersion} (${result.bundleCommit})`,
    `     tracker: ${result.trackerVersion ?? "(unknown)"} (${result.trackerCommit ?? "(unknown)"})`,
    "",
    "     They read and write the same YAML, so a schema change in between can",
    "     corrupt data or fail in confusing ways.",
    "",
    "     Fix: reinstall the bundle from the running tracker \u2014",
    "       curl -fsSL <tracker-url>/api/setup | bash",
    "",
    "     Set TRACKER_STRICT_VERSION=1 to make this refusal fatal instead.",
    ""
  ];
}

// src/tools/token-tools.ts
function calculateCost(tokens) {
  const costPerToken = 3e-5;
  return tokens * costPerToken;
}
async function getTokenMetrics(dataDir, options) {
  const trackerFs = new TrackerFileSystem(dataDir);
  const metrics = {
    totalTokens: 0,
    totalSessions: 0,
    estimatedCostUSD: 0,
    byAgent: {},
    byTicket: []
  };
  const ticketPaths = await trackerFs.findTickets();
  for (const ticketPath of ticketPaths) {
    const ticket = await trackerFs.readTicket(ticketPath);
    if (options?.ticketNumber && ticket.ticket_number !== options.ticketNumber) {
      continue;
    }
    if (options?.feature && ticket.feature !== options.feature) {
      continue;
    }
    if (ticket.work_sessions) {
      let ticketTokens = 0;
      let ticketSessions = 0;
      for (const session of ticket.work_sessions) {
        if (options?.timeRange) {
          const sessionDate = new Date(session.start);
          const startDate = new Date(options.timeRange.start);
          const endDate = new Date(options.timeRange.end);
          if (sessionDate < startDate || sessionDate > endDate) {
            continue;
          }
        }
        if (session.tokens) {
          ticketTokens += session.tokens;
          ticketSessions++;
          metrics.totalTokens += session.tokens;
          metrics.totalSessions++;
          if (!metrics.byAgent[session.agent]) {
            metrics.byAgent[session.agent] = {
              tokens: 0,
              sessions: 0,
              duration: "00:00:00"
            };
          }
          metrics.byAgent[session.agent].tokens += session.tokens;
          metrics.byAgent[session.agent].sessions++;
          if (session.duration) {
            metrics.byAgent[session.agent].duration = addDurations2(
              metrics.byAgent[session.agent].duration,
              session.duration
            );
          }
        }
      }
      if (ticketTokens > 0) {
        metrics.byTicket.push({
          ticketNumber: ticket.ticket_number,
          title: ticket.title,
          tokens: ticketTokens,
          sessions: ticketSessions
        });
      }
    }
  }
  metrics.estimatedCostUSD = calculateCost(metrics.totalTokens);
  metrics.byTicket.sort((a, b) => b.tokens - a.tokens);
  return metrics;
}
async function getTokenCostReport(dataDir, options) {
  const trackerFs = new TrackerFileSystem(dataDir);
  const report = {
    totalCost: 0,
    costByFeature: {},
    costByAgent: {},
    costByTicket: [],
    timeRange: options?.dateRange
  };
  const ticketPaths = await trackerFs.findTickets();
  for (const ticketPath of ticketPaths) {
    const ticket = await trackerFs.readTicket(ticketPath);
    if (options?.feature && ticket.feature !== options.feature) {
      continue;
    }
    if (ticket.work_sessions) {
      let ticketTokens = 0;
      for (const session of ticket.work_sessions) {
        if (options?.dateRange) {
          const sessionDate = new Date(session.start);
          const startDate = new Date(options.dateRange.start);
          const endDate = new Date(options.dateRange.end);
          if (sessionDate < startDate || sessionDate > endDate) {
            continue;
          }
        }
        if (session.tokens) {
          ticketTokens += session.tokens;
          if (!report.costByAgent[session.agent]) {
            report.costByAgent[session.agent] = 0;
          }
          report.costByAgent[session.agent] += calculateCost(session.tokens);
          if (!report.costByFeature[ticket.feature]) {
            report.costByFeature[ticket.feature] = 0;
          }
          report.costByFeature[ticket.feature] += calculateCost(session.tokens);
        }
      }
      if (ticketTokens > 0) {
        const ticketCost = calculateCost(ticketTokens);
        report.totalCost += ticketCost;
        report.costByTicket.push({
          ticketNumber: ticket.ticket_number,
          title: ticket.title,
          cost: ticketCost,
          tokens: ticketTokens
        });
      }
    }
  }
  report.costByTicket.sort((a, b) => b.cost - a.cost);
  return report;
}
async function getActiveTokenMonitor() {
  return {
    isActive: false
  };
}
function addDurations2(duration1, duration2) {
  const parse = (d) => {
    const parts = d.split(":").map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  };
  const totalSeconds = parse(duration1) + parse(duration2);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// src/tools/activity-tools.ts
function normalizeTypes(types) {
  if (!types) return void 0;
  const list = Array.isArray(types) ? types : types.split(",");
  const trimmed = list.map((t) => t.trim()).filter(Boolean);
  return trimmed.length ? trimmed : void 0;
}
function buildDigestUrl(args, port) {
  const resolvedPort = port || process.env.TRACKER_PUBLIC_PORT || process.env.API_PORT || "3002";
  const params = new URLSearchParams();
  params.set("view", args.groupBy === "feature" ? "features" : "standup");
  if (args.from) params.set("from", args.from);
  if (args.to) params.set("to", args.to);
  if (args.feature) params.set("feature", args.feature);
  const types = normalizeTypes(args.types);
  if (types) params.set("types", types.join(","));
  return `http://localhost:${resolvedPort}/digest?${params.toString()}`;
}
async function queryActivity(dataDir, args) {
  const fs3 = new TrackerFileSystem(dataDir);
  const paths = await fs3.findTickets();
  const tickets = await Promise.all(paths.map((p) => fs3.readTicket(p)));
  const query = {
    from: args.from,
    to: args.to,
    feature: args.feature,
    ticket: args.ticket,
    types: normalizeTypes(args.types),
    groupBy: args.groupBy ?? "day",
    limit: args.limit
  };
  const { groups, totals, attention } = buildActivity(tickets, query);
  return { totals, groups, attention, url: buildDigestUrl(args) };
}
function formatActivitySummary(result) {
  const { totals, attention, url } = result;
  const lines = [
    `\u{1F4CA} Activity: ${totals.ticketsCompleted} tickets completed, ${totals.commits} commits, ${totals.sessions} sessions, ${totals.tokens.toLocaleString()} tokens (${totals.events} events, ${totals.activeTickets} active tickets)`
  ];
  for (const group of result.groups.slice(0, 10)) {
    lines.push(
      `  \u2022 ${group.key}: ${group.totals.ticketsCompleted} done, ${group.totals.commits} commits, ${group.totals.tokens.toLocaleString()} tokens`
    );
  }
  if (attention.length > 0) {
    lines.push(`\u26A0\uFE0F Needs attention:`);
    for (const flag of attention) {
      lines.push(`  \u2022 #${flag.ticket} ${flag.ticketTitle} \u2014 ${flag.type}`);
    }
  }
  lines.push(`\u{1F517} ${url}`);
  return lines.join("\n");
}

// src/index.ts
var bundleVersion = {
  version: true ? "1.0.0" : "dev",
  gitCommit: true ? "eca4c71" : "unknown",
  buildTime: true ? "2026-08-13T15:55:23Z" : "unknown"
};
async function reportVersionSkew() {
  const trackerUrl = process.env.TRACKER_API_URL;
  if (!trackerUrl) return false;
  const result = await checkVersionSkew({
    bundle: bundleVersion,
    trackerUrl,
    strict: process.env.TRACKER_STRICT_VERSION === "1"
  });
  for (const line of formatSkewWarning(result)) {
    console.error(line);
  }
  serverLogger.debug("Version handshake complete", {
    status: result.status,
    bundle: result.bundleCommit,
    tracker: result.trackerCommit
  });
  return result.shouldRefuse;
}
var config = getConfigManager();
var serverConfig = config.getConfig();
var trackerConfig = config.getTrackerConfig();
console.error("Tracker Config:", JSON.stringify(trackerConfig, null, 2));
console.error("Environment MCP_SCRIPT_PATH:", process.env.MCP_SCRIPT_PATH);
console.error("Bundle:", formatBundleLine(bundleVersion));
var processManager = new ProcessManager();
var exitRecorder = new ExitRecorder(trackerConfig.dataDir);
exitRecorder.install();
var serverLogger = logger.child("server");
var TicketEventEmitter = class extends EventEmitter3 {
  watchers = /* @__PURE__ */ new Map();
  // Single TrackerFileSystem, reused across events, so status reads hit the
  // corpus's fingerprint cache instead of reparsing every ticket on every
  // event (mirrors the #335 API watcher's file-watcher.ts).
  fs = new TrackerFileSystem(trackerConfig.dataDir);
  startWatching() {
    try {
      const watchPath = join9(trackerConfig.dataDir, TICKETS_DIR);
      try {
        const watcher = watch(watchPath, { recursive: false }, (eventType, filename) => {
          if (!filename || !isTicketFilename(filename)) return;
          void this.handleTicketFileEvent(eventType, filename);
        });
        this.watchers.set(TICKETS_DIR, watcher);
        serverLogger.debug("Started watching directory", { watchPath });
      } catch (error) {
        serverLogger.error(`Failed to watch ${watchPath}`, error);
      }
      serverLogger.info("File watching system started");
    } catch (error) {
      serverLogger.error("Failed to start file watching", error);
    }
  }
  /**
   * Status lives in the ticket body now, not the watch path (#335), so each
   * event needs a read. A delete leaves no body to read, and both chokidar
   * (API side) and this raw `fs.watch` can fire mid atomic-write — both are
   * legitimate events, so a read failure here means `status` stays absent
   * rather than the event being thrown away.
   */
  async handleTicketFileEvent(eventType, filename) {
    let status;
    let feature;
    try {
      const ticket = await this.fs.readTicket(ticketRelPath(filename));
      status = ticket.status;
      feature = ticket.feature;
    } catch {
    }
    this.emit("ticketChange", {
      type: eventType,
      filename,
      status,
      feature,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    serverLogger.debug("Ticket file change detected", {
      eventType,
      filename,
      status,
      feature
    });
  }
  stopWatching() {
    this.watchers.forEach((watcher) => watcher.close());
    this.watchers.clear();
    serverLogger.info("File watching system stopped");
  }
};
var ticketEvents = new TicketEventEmitter();
async function executeOperation(toolName, args, run) {
  const startTime = Date.now();
  const auditArgs = Object.entries(args).filter(([, value]) => value !== void 0 && value !== null).flatMap(([key, value]) => [`--${key}`, String(value)]);
  try {
    const { messages } = await run();
    const output = messages.join("\n");
    logScriptExecution(toolName, auditArgs, output ? output + "\n" : "", void 0, 0, trackerConfig.dataDir);
    serverLogger.debug("Operation completed in-process", {
      toolName,
      duration: Date.now() - startTime
    });
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logScriptExecution(toolName, auditArgs, "", `${message}
`, 1, trackerConfig.dataDir);
    serverLogger.error("Operation failed in-process", error, { toolName });
    throw error;
  }
}
var server = new Server(
  {
    name: serverConfig.server.name,
    version: serverConfig.server.version
  },
  {
    capabilities: {
      tools: {}
    }
  }
);
var ListToolsSchema = external_exports.object({
  method: external_exports.literal("tools/list")
});
var CallToolSchema = external_exports.object({
  method: external_exports.literal("tools/call"),
  params: external_exports.object({
    name: external_exports.string(),
    arguments: external_exports.any()
  })
});
var MAX_CHARS_PARAM = {
  type: "number",
  default: DEFAULT_MAX_CHARS,
  description: "Character budget for the response. Output is truncated at a record boundary \u2014 never mid-record \u2014 and reports how many records were dropped. Prefer narrowing the query with the filter parameters above; raise it for the whole set only when you need every record."
};
var TICKET_MAX_CHARS_PARAM = {
  type: "number",
  default: DEFAULT_TICKET_MAX_CHARS,
  description: "Character budget for the response. The identity block, description and implementation steps are always returned in full; comment and session history is dropped whole-section-at-a-time to fit, and the response says which sections went. Narrow with sections: or comments: before raising this."
};
server.setRequestHandler(ListToolsSchema, async () => {
  return {
    tools: [
      {
        name: "createFeature",
        description: "Create a new feature",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Feature name (kebab-case)" },
            description: { type: "string", description: "Feature description" },
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
              default: "medium"
            }
          },
          required: ["name", "description"]
        }
      },
      {
        name: "createTicket",
        description: "Create a new ticket",
        inputSchema: {
          type: "object",
          properties: {
            feature: { type: "string", description: "Feature name" },
            title: { type: "string", description: "Ticket title" },
            description: { type: "string", description: "Ticket description" },
            type: {
              type: "string",
              enum: ["bug", "task", "story", "spike"],
              default: "task"
            },
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
              default: "medium"
            },
            labels: {
              type: "array",
              items: { type: "string" },
              description: "Array of labels"
            }
          },
          required: ["feature", "title", "description"]
        }
      },
      {
        name: "updateTicketStatus",
        description: "Update ticket status",
        inputSchema: {
          type: "object",
          properties: {
            ticketNumber: { type: "number", description: "Ticket number" },
            newStatus: {
              type: "string",
              enum: ["todo", "in-progress", "done"]
            }
          },
          required: ["ticketNumber", "newStatus"]
        }
      },
      {
        name: "addComment",
        description: "Add comment to ticket",
        inputSchema: {
          type: "object",
          properties: {
            ticketNumber: { type: "number", description: "Ticket number" },
            text: { type: "string", description: "Comment text" }
          },
          required: ["ticketNumber", "text"]
        }
      },
      {
        name: "showTicketDetails",
        description: `Get ticket details. Comment history is trimmed to the most recent comment by default \u2014 the most recent SUBSTANTIVE one, skipping the automated "Status changed from\u2026" echoes; pass comments:'all' for the full history. The description and implementation steps always come back in full.`,
        inputSchema: {
          type: "object",
          properties: {
            ticketNumber: { type: "number", description: "Ticket number" },
            comments: {
              type: "string",
              enum: ["none", "last", "all"],
              default: "last",
              description: "How much comment history to return. 'last' is the most recent comment only."
            },
            sections: {
              type: "array",
              items: {
                type: "string",
                enum: ["meta", "description", "steps", "comments", "sessions"]
              },
              description: "Sections to return. Omit for all of them."
            },
            maxChars: TICKET_MAX_CHARS_PARAM
          },
          required: ["ticketNumber"]
        }
      },
      {
        name: "syncDependencies",
        description: "Update DEPENDENCIES.md from ticket data",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "checkIntegrity",
        description: "Report referential inconsistencies in the tracker store: feature directories with no features/<name>.yaml, registered features with no tickets, and tickets whose feature or status disagrees with the directory holding them. Read-only \u2014 it never repairs.",
        inputSchema: {
          type: "object",
          properties: {
            json: {
              type: "boolean",
              default: false,
              description: "Return the structured report as JSON instead of the text summary"
            }
          }
        }
      },
      {
        name: "listTickets",
        description: "List and search tickets with advanced filtering options",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["todo", "in-progress", "done"],
              description: "Filter by status"
            },
            feature: {
              type: "string",
              description: "Filter by feature name"
            },
            assignee: {
              type: "string",
              description: "Filter by assignee"
            },
            type: {
              type: "string",
              enum: ["bug", "task", "story", "spike"],
              description: "Filter by ticket type"
            },
            keyword: {
              type: "string",
              description: "Search in title and description"
            },
            labels: {
              type: "array",
              items: { type: "string" },
              description: "Filter by labels"
            },
            createdAfter: {
              type: "string",
              description: "Filter tickets created after date (YYYY-MM-DD)"
            },
            createdBefore: {
              type: "string",
              description: "Filter tickets created before date (YYYY-MM-DD)"
            },
            titleContains: {
              type: "string",
              description: "Partial title matching"
            },
            featureContains: {
              type: "string",
              description: "Partial feature name matching"
            },
            regex: {
              type: "string",
              description: "Search using regular expression"
            },
            caseSensitive: {
              type: "boolean",
              default: false,
              description: "Enable case-sensitive search"
            },
            searchIn: {
              type: "array",
              items: {
                type: "string",
                enum: ["title", "description", "comments"]
              },
              default: ["title", "description"],
              description: "Fields to search in"
            },
            outputFormat: {
              type: "string",
              enum: ["compact", "table", "json", "csv", "count"],
              default: "compact",
              description: 'Output format. compact (the default) is one line per ticket \u2014 "#291 t/h feature | full title" \u2014 and is ~66% cheaper than table while never truncating the title. Use table only when the box-drawn layout is being shown to a human verbatim.'
            },
            limit: {
              type: "number",
              description: "Limit number of results"
            },
            sortBy: {
              type: "array",
              items: {
                type: "string",
                enum: ["number", "priority", "created", "title"]
              },
              default: ["number"],
              description: "Sort by field(s)"
            },
            reverse: {
              type: "boolean",
              default: false,
              description: "Reverse sort order"
            },
            maxChars: MAX_CHARS_PARAM
          }
        }
      },
      {
        name: "listFeatures",
        description: "List all features with their status and progress",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["completed", "in-progress", "todo"],
              description: "Filter by status"
            },
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
              description: "Filter by priority"
            },
            detailed: {
              type: "boolean",
              default: false,
              description: "Show detailed information"
            },
            outputFormat: {
              type: "string",
              enum: ["compact", "table", "json", "csv"],
              default: "compact",
              description: 'Output format. compact (the default) is one line per feature \u2014 "<name> <priority>/<status> <tickets> <progress>%", with a flag omitted when you filtered on it. table is the framed version.'
            },
            maxChars: MAX_CHARS_PARAM
          }
        }
      },
      {
        name: "updateTicket",
        description: "Update ticket properties (type, priority)",
        inputSchema: {
          type: "object",
          properties: {
            ticketNumber: { type: "number", description: "Ticket number" },
            type: {
              type: "string",
              enum: ["bug", "task", "story", "spike"],
              description: "New ticket type"
            },
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
              description: "New priority"
            }
          },
          required: ["ticketNumber"]
        }
      },
      {
        name: "logWorkSession",
        description: "Log work session with start/end actions",
        inputSchema: {
          type: "object",
          properties: {
            ticketNumber: { type: "number", description: "Ticket number" },
            action: {
              type: "string",
              enum: ["start", "end", "update"],
              description: "Action to perform (start, end, or update)"
            },
            agent: {
              type: "string",
              default: "mcp-client",
              description: "Agent name"
            },
            summary: {
              type: "string",
              description: "Work session summary"
            },
            tokens: {
              type: "number",
              default: 0,
              description: "Token usage for AI agents"
            }
          },
          required: ["ticketNumber", "action", "summary"]
        }
      },
      {
        name: "updateWorkSessionPrompts",
        description: "Update current work session with prompts from Claude JSONL files",
        inputSchema: {
          type: "object",
          properties: {
            ticketNumber: { type: "number", description: "Ticket number" },
            claudeDataPath: {
              type: "string",
              description: "Path to Claude data directory (default: ~/.claude)"
            }
          },
          required: ["ticketNumber"]
        }
      },
      {
        name: "listWorkSessions",
        description: "List work sessions with filtering options",
        inputSchema: {
          type: "object",
          properties: {
            ticketNumber: {
              type: "number",
              description: "Filter by ticket number"
            },
            agent: {
              type: "string",
              description: "Filter by agent name"
            },
            startDate: {
              type: "string",
              description: "Filter sessions after date (YYYY-MM-DD)"
            },
            endDate: {
              type: "string",
              description: "Filter sessions before date (YYYY-MM-DD)"
            },
            outputFormat: {
              type: "string",
              enum: ["table", "json", "csv"],
              default: "table",
              description: "Output format"
            },
            maxChars: MAX_CHARS_PARAM
          }
        }
      },
      {
        name: "editFeature",
        description: "Edit feature properties",
        inputSchema: {
          type: "object",
          properties: {
            featureName: {
              type: "string",
              description: "Feature name to edit"
            },
            title: {
              type: "string",
              description: "New feature title"
            },
            description: {
              type: "string",
              description: "New description"
            },
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
              description: "New priority"
            },
            assignee: {
              type: "string",
              description: "New assignee"
            }
          },
          required: ["featureName"]
        }
      },
      // Advanced MCP Features
      {
        name: "bulkCreateTickets",
        description: "Create multiple tickets in batch",
        inputSchema: {
          type: "object",
          properties: {
            tickets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Unique identifier for this operation" },
                  feature: { type: "string", description: "Feature name" },
                  title: { type: "string", description: "Ticket title" },
                  description: { type: "string", description: "Ticket description" },
                  type: {
                    type: "string",
                    enum: ["bug", "task", "story", "spike"],
                    default: "task"
                  },
                  priority: {
                    type: "string",
                    enum: ["critical", "high", "medium", "low"],
                    default: "medium"
                  },
                  labels: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of labels"
                  },
                  implementation_steps: {
                    type: "array",
                    description: "Structured implementation steps for TDD workflow",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number", description: "Step number" },
                        action: {
                          type: "string",
                          enum: ["write-test", "verify-fail", "implement", "verify-pass", "refactor", "commit"],
                          description: "Step action type"
                        },
                        description: { type: "string", description: "Step description" },
                        file: { type: "string", description: "Target file path" },
                        command: { type: "string", description: "Command to run" },
                        expected_result: { type: "string", description: "Expected result" },
                        status: {
                          type: "string",
                          enum: ["pending", "done", "skipped"],
                          default: "pending"
                        },
                        code: { type: "string", description: "Code snippet" }
                      },
                      required: ["id", "action", "description", "status"]
                    }
                  }
                },
                required: ["id", "feature", "title", "description"]
              },
              description: "Array of tickets to create"
            }
          },
          required: ["tickets"]
        }
      },
      {
        name: "bulkUpdateTicketStatus",
        description: "Update status for multiple tickets in batch",
        inputSchema: {
          type: "object",
          properties: {
            updates: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Unique identifier for this operation" },
                  ticketNumber: { type: "number", description: "Ticket number" },
                  newStatus: {
                    type: "string",
                    enum: ["todo", "in-progress", "done"]
                  }
                },
                required: ["id", "ticketNumber", "newStatus"]
              },
              description: "Array of status updates"
            }
          },
          required: ["updates"]
        }
      },
      {
        name: "bulkAddComments",
        description: "Add comments to multiple tickets in batch",
        inputSchema: {
          type: "object",
          properties: {
            comments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Unique identifier for this operation" },
                  ticketNumber: { type: "number", description: "Ticket number" },
                  text: { type: "string", description: "Comment text" },
                  author: { type: "string", default: "mcp-client", description: "Comment author" }
                },
                required: ["id", "ticketNumber", "text"]
              },
              description: "Array of comments to add"
            }
          },
          required: ["comments"]
        }
      },
      {
        name: "advancedTicketSearch",
        description: "Advanced ticket search with complex queries and aggregations",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "object",
              properties: {
                conditions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field: {
                        type: "string",
                        enum: ["title", "description", "status", "priority", "feature", "assignee", "type", "labels", "created"]
                      },
                      operator: {
                        type: "string",
                        enum: ["equals", "contains", "startsWith", "endsWith", "regex", "gt", "lt", "gte", "lte", "in", "notIn"]
                      },
                      value: { description: "Value to compare against (string, number, or array)" }
                    },
                    required: ["field", "operator", "value"]
                  },
                  description: "Search conditions"
                },
                logic: {
                  type: "string",
                  enum: ["AND", "OR"],
                  default: "AND",
                  description: "Logic operator for combining conditions"
                }
              },
              required: ["conditions"]
            },
            aggregations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["count", "groupBy", "avg", "sum", "min", "max"]
                  },
                  field: { type: "string", description: "Field to aggregate on" }
                },
                required: ["type"]
              },
              description: "Aggregation operations to perform"
            },
            sort: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string", description: "Field to sort by" },
                  direction: { type: "string", enum: ["asc", "desc"], default: "asc" }
                },
                required: ["field"]
              },
              description: "Sort configuration"
            },
            limit: { type: "number", description: "Maximum number of results" },
            offset: { type: "number", description: "Number of results to skip" }
          },
          required: ["query"]
        }
      },
      {
        name: "manageTicketDependencies",
        description: "Manage ticket dependencies and relationships",
        inputSchema: {
          type: "object",
          properties: {
            operation: {
              type: "string",
              enum: ["add", "remove", "list", "analyze"],
              description: "Operation to perform"
            },
            ticketNumber: {
              type: "number",
              description: "Primary ticket number"
            },
            dependsOn: {
              type: "array",
              items: { type: "number" },
              description: "Tickets this ticket depends on"
            },
            blocks: {
              type: "array",
              items: { type: "number" },
              description: "Tickets this ticket blocks"
            }
          },
          required: ["operation"]
        }
      },
      {
        name: "subscribeToTicketChanges",
        description: "Subscribe to real-time ticket change notifications",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["start", "stop", "status"],
              description: "Subscription action"
            },
            filters: {
              type: "object",
              properties: {
                status: {
                  type: "array",
                  items: { type: "string", enum: ["todo", "in-progress", "done"] },
                  description: "Filter by status"
                },
                features: {
                  type: "array",
                  items: { type: "string" },
                  description: "Filter by features"
                },
                ticketNumbers: {
                  type: "array",
                  items: { type: "number" },
                  description: "Filter by specific ticket numbers"
                }
              },
              description: "Subscription filters"
            }
          },
          required: ["action"]
        }
      },
      {
        name: "generateAnalytics",
        description: "Generate analytics and reports for tickets and features",
        inputSchema: {
          type: "object",
          properties: {
            reportType: {
              type: "string",
              // The set the shared AnalyticsService implements. velocity/burndown/
              // workload/completion were removed by #263; the CLI script kept private
              // copies until #291 repointed it here.
              enum: [...ANALYTICS_REPORT_TYPES],
              description: "Type of report to generate"
            },
            timeRange: {
              type: "object",
              properties: {
                start: { type: "string", description: "Start date (YYYY-MM-DD)" },
                end: { type: "string", description: "End date (YYYY-MM-DD)" }
              },
              description: "Time range for the report"
            },
            filters: {
              type: "object",
              properties: {
                features: {
                  type: "array",
                  items: { type: "string" },
                  description: "Filter by features"
                },
                assignees: {
                  type: "array",
                  items: { type: "string" },
                  description: "Filter by assignees"
                },
                types: {
                  type: "array",
                  items: { type: "string", enum: ["bug", "task", "story", "spike"] },
                  description: "Filter by ticket types"
                }
              },
              description: "Report filters"
            },
            format: {
              type: "string",
              enum: ["json", "csv", "summary"],
              default: "summary",
              description: "Output format"
            }
          },
          required: ["reportType"]
        }
      },
      {
        name: "healthCheck",
        description: "Get server health status and system metrics",
        inputSchema: {
          type: "object",
          properties: {
            detailed: {
              type: "boolean",
              default: false,
              description: "Include detailed system metrics"
            }
          }
        }
      },
      {
        name: "getMetrics",
        description: "Get performance metrics and monitoring data",
        inputSchema: {
          type: "object",
          properties: {
            format: {
              type: "string",
              enum: ["json", "prometheus"],
              default: "json",
              description: "Output format for metrics"
            },
            duration: {
              type: "number",
              description: "Time window in milliseconds for metrics history"
            }
          }
        }
      },
      {
        name: "getProcessInfo",
        description: "Get process information and runtime details",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "queryActivity",
        description: "Query derived activity events (sessions, commits, status changes, verifications) \u2014 the digest data. Returns totals, groups, attention flags, and the matching /digest UI URL to hand to the human.",
        inputSchema: {
          type: "object",
          properties: {
            from: { type: "string", description: "Start date YYYY-MM-DD (inclusive)" },
            to: { type: "string", description: "End date YYYY-MM-DD (inclusive)" },
            feature: { type: "string", description: "Filter by feature name" },
            ticket: { type: "number", description: "Filter by ticket number" },
            types: {
              type: "string",
              description: "CSV of event types: session,commit,comment,status-change,ticket-created,ticket-completed,verification"
            },
            groupBy: { type: "string", enum: ["day", "feature", "none"], default: "day" },
            limit: { type: "number", description: "Max events returned" }
          }
        }
      },
      {
        name: "getTokenMetrics",
        description: "Get aggregated token usage metrics across tickets and features",
        inputSchema: {
          type: "object",
          properties: {
            ticketNumber: {
              type: "number",
              description: "Filter by specific ticket number"
            },
            feature: {
              type: "string",
              description: "Filter by feature name"
            },
            timeRange: {
              type: "object",
              properties: {
                start: { type: "string", description: "Start date (YYYY-MM-DD)" },
                end: { type: "string", description: "End date (YYYY-MM-DD)" }
              },
              description: "Time range for metrics"
            }
          }
        }
      },
      {
        name: "getTokenCostReport",
        description: "Get token usage cost breakdown by ticket, feature, and agent",
        inputSchema: {
          type: "object",
          properties: {
            feature: {
              type: "string",
              description: "Filter by feature name"
            },
            dateRange: {
              type: "object",
              properties: {
                start: { type: "string", description: "Start date (YYYY-MM-DD)" },
                end: { type: "string", description: "End date (YYYY-MM-DD)" }
              },
              description: "Date range for cost calculation"
            }
          }
        }
      },
      {
        name: "getActiveTokenMonitor",
        description: "Get status of any active token monitoring session",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "listActiveSessions",
        description: "Find and list all active work sessions across all tickets",
        inputSchema: {
          type: "object",
          properties: {
            agent: {
              type: "string",
              description: "Filter by agent name"
            },
            staleThreshold: {
              type: "number",
              default: 24,
              description: "Threshold for stale sessions in hours"
            },
            onlyStale: {
              type: "boolean",
              default: false,
              description: "Show only stale sessions"
            },
            outputFormat: {
              type: "string",
              enum: ["table", "json", "yaml"],
              default: "table",
              description: "Output format"
            },
            maxChars: MAX_CHARS_PARAM
          }
        }
      },
      {
        name: "updateImplementationStep",
        description: "Update the status of an implementation step within a ticket",
        inputSchema: {
          type: "object",
          properties: {
            ticketNumber: { type: "number", description: "Ticket number" },
            stepId: { type: "number", description: "Step ID to update" },
            status: { type: "string", enum: ["pending", "done", "skipped"], description: "New step status" }
          },
          required: ["ticketNumber", "stepId", "status"]
        }
      },
      {
        name: "recordVerification",
        description: "Record test/build verification results on a ticket",
        inputSchema: {
          type: "object",
          properties: {
            ticketNumber: { type: "number", description: "Ticket number" },
            testsPassed: { type: "boolean", description: "Whether tests passed" },
            testCommand: { type: "string", description: "Test command run" },
            testOutput: { type: "string", description: "Test output summary" },
            buildPassed: { type: "boolean", description: "Whether build passed" },
            buildCommand: { type: "string", description: "Build command run" }
          },
          required: ["ticketNumber"]
        }
      },
      {
        name: "updateChecklist",
        description: "Check or uncheck a checklist item on a ticket",
        inputSchema: {
          type: "object",
          properties: {
            ticketNumber: { type: "number", description: "Ticket number" },
            index: { type: "number", description: "Checklist item index (0-based)" },
            checked: { type: "boolean", description: "Whether item is checked" }
          },
          required: ["ticketNumber", "index", "checked"]
        }
      },
      {
        name: "updateFeatureDesign",
        description: "Set or update the design document on a feature",
        inputSchema: {
          type: "object",
          properties: {
            featureName: { type: "string", description: "Feature name" },
            approach: { type: "string", description: "Design approach description" },
            decisions: {
              type: "array",
              items: { type: "string" },
              description: "Key design decisions"
            },
            approved: { type: "boolean", description: "Whether design is approved" }
          },
          required: ["featureName", "approach", "approved"]
        }
      },
      {
        name: "updateFeaturePlan",
        description: "Set or update the implementation plan on a feature",
        inputSchema: {
          type: "object",
          properties: {
            featureName: { type: "string", description: "Feature name" },
            phases: {
              type: "string",
              description: "JSON-encoded array of plan phases"
            }
          },
          required: ["featureName", "phases"]
        }
      },
      {
        name: "updateFeatureReview",
        description: "Set or update the review status on a feature",
        inputSchema: {
          type: "object",
          properties: {
            featureName: { type: "string", description: "Feature name" },
            status: {
              type: "string",
              enum: ["pending", "in-review", "approved", "changes-requested"],
              description: "Review status"
            },
            reviewer: { type: "string", description: "Reviewer name" },
            notes: { type: "string", description: "Review notes" }
          },
          required: ["featureName", "status"]
        }
      },
      {
        name: "updateFeatureWorktree",
        description: "Set or update the worktree reference on a feature",
        inputSchema: {
          type: "object",
          properties: {
            featureName: { type: "string", description: "Feature name" },
            branch: { type: "string", description: "Git branch name" },
            path: { type: "string", description: "Worktree filesystem path" }
          },
          required: ["featureName", "branch"]
        }
      }
    ]
  };
});
server.setRequestHandler(CallToolSchema, async (request) => {
  serverLogger.debug("Received tool call request", {
    request,
    requestType: typeof request,
    requestKeys: request ? Object.keys(request) : []
  });
  const params = request.params;
  if (!params) {
    serverLogger.error("No params found in request", new Error("Missing params"), {
      requestData: JSON.stringify(request, null, 2),
      requestType: typeof request,
      requestKeys: request ? Object.keys(request) : []
    });
    throw new Error("Invalid request: missing params");
  }
  const { name, arguments: args } = params;
  if (!name) {
    serverLogger.error("No tool name found in request", new Error("Missing tool name"), {
      paramsData: JSON.stringify(params, null, 2),
      paramsKeys: params ? Object.keys(params) : []
    });
    throw new Error("Invalid request: missing tool name");
  }
  serverLogger.debug("Processing tool call", {
    name,
    args,
    argsType: typeof args,
    argsKeys: args ? Object.keys(args) : []
  });
  try {
    switch (name) {
      case "createFeature": {
        const { name: featureName, description, priority = "medium" } = args;
        const output = await executeOperation(
          "create-feature",
          { name: featureName, description, priority, "data-dir": trackerConfig.dataDir },
          () => createFeatureOperations(trackerConfig.dataDir).createFeature({
            name: featureName,
            description,
            priority
          })
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Created feature: ${featureName}`
            }
          ]
        };
      }
      case "createTicket": {
        const { feature, title, description, type: type2 = "task", priority = "medium", labels = [] } = args;
        const output = await executeOperation(
          "create-ticket",
          {
            feature,
            title,
            description,
            type: type2,
            priority,
            ...Array.isArray(labels) && labels.length > 0 ? { labels: labels.join(",") } : {},
            "data-dir": trackerConfig.dataDir
          },
          () => createTicketOperations(trackerConfig.dataDir).createTicket({
            feature,
            title,
            description,
            type: type2,
            priority,
            labels: Array.isArray(labels) ? labels : []
          })
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Created ticket: ${title}`
            }
          ]
        };
      }
      case "updateTicketStatus": {
        const { ticketNumber, newStatus } = args;
        const output = await executeOperation(
          "move-ticket",
          { ticket: ticketNumber, status: newStatus, "data-dir": trackerConfig.dataDir },
          () => createTicketOperations(trackerConfig.dataDir).moveTicket(ticketNumber, newStatus)
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Updated ticket #${ticketNumber} status to ${newStatus}`
            }
          ]
        };
      }
      case "addComment": {
        const { ticketNumber, text } = args;
        serverLogger.debug("addComment request received", {
          ticketNumber,
          textLength: text ? text.length : 0,
          textType: typeof text,
          textValue: text,
          hasNewlines: text ? text.includes("\n") : false,
          hasSpecialChars: text ? /[`"'\\]/.test(text) : false
        });
        if (!text || typeof text !== "string") {
          serverLogger.error("Invalid comment text", new Error("Comment text is missing or not a string"), {
            ticketNumber,
            textType: typeof text,
            textValue: text
          });
          throw new Error(`Invalid comment text: ${text === void 0 ? "undefined" : text === null ? "null" : "empty or invalid type"}`);
        }
        serverLogger.debug("Adding comment in-process", {
          ticketNumber,
          commentLength: text.length
        });
        const output = await executeOperation(
          "add-comment",
          {
            ticket: ticketNumber,
            comment: `[comment with ${text.length} chars]`,
            author: "mcp-client",
            "data-dir": trackerConfig.dataDir
          },
          () => createTicketOperations(trackerConfig.dataDir).addComment(
            ticketNumber,
            text,
            "mcp-client"
          )
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Added comment to ticket #${ticketNumber}`
            }
          ]
        };
      }
      case "showTicketDetails": {
        const { ticketNumber, comments = "last", sections, maxChars = DEFAULT_TICKET_MAX_CHARS } = args;
        const output = await showTicket(trackerConfig.dataDir, ticketNumber, {
          comments,
          sections,
          maxChars
        });
        return {
          content: [
            {
              type: "text",
              text: output || `Ticket #${ticketNumber} details`
            }
          ]
        };
      }
      case "syncDependencies": {
        const output = await executeOperation(
          "update-all-yaml",
          { "data-dir": trackerConfig.dataDir },
          async () => ({
            messages: await regenerateAllReports(new TrackerFileSystem(trackerConfig.dataDir))
          })
        );
        return {
          content: [
            {
              type: "text",
              text: output || "\u2705 Updated dependencies and status reports"
            }
          ]
        };
      }
      case "checkIntegrity": {
        const { json: json2 = false } = args;
        const output = await executeOperation(
          "check-integrity",
          { "data-dir": trackerConfig.dataDir, json: json2 },
          async () => {
            const report = await checkIntegrity(trackerConfig.dataDir);
            return {
              messages: json2 ? [JSON.stringify({ ...report, messages: void 0 }, null, 2)] : report.messages
            };
          }
        );
        return {
          content: [
            {
              type: "text",
              text: output || "\u2705 Integrity check produced no output"
            }
          ]
        };
      }
      case "listTickets": {
        const {
          status,
          feature,
          assignee,
          type: type2,
          keyword,
          labels,
          createdAfter,
          createdBefore,
          titleContains,
          featureContains,
          regex,
          caseSensitive = false,
          searchIn = ["title", "description"],
          // Compact by default on the MCP path ONLY (#295). The shared operation
          // still defaults to table, which is what keeps CLI list-tickets and
          // the UI byte-for-byte unchanged — the default belongs here, at the
          // call site, not in read-operations.ts.
          outputFormat = "compact",
          limit,
          sortBy: sortBy2 = ["number"],
          reverse = false,
          // The response budget (#297), same placement argument. #295 made each
          // record cheaper; this bounds how many of them a single response can
          // carry, which is what turns "I asked for all tickets and got 40k
          // tokens" from a possibility into an impossibility.
          maxChars = DEFAULT_MAX_CHARS
        } = args;
        const output = await listTickets(trackerConfig.dataDir, {
          status,
          feature,
          assignee,
          type: type2,
          keyword,
          labels,
          createdAfter,
          createdBefore,
          titleContains,
          featureContains,
          regex,
          caseSensitive,
          searchIn,
          output: outputFormat,
          limit,
          sort: sortBy2,
          reverse,
          maxChars
        });
        return {
          content: [
            {
              type: "text",
              text: output || "No tickets found"
            }
          ]
        };
      }
      case "listFeatures": {
        const { priority, status, detailed = false, outputFormat = "compact", maxChars = DEFAULT_MAX_CHARS } = args;
        const output = await listFeatures(trackerConfig.dataDir, {
          priority,
          status,
          detailed,
          output: outputFormat,
          maxChars
        });
        const result = { stdout: output };
        return {
          content: [
            {
              type: "text",
              text: result.stdout || "No features found"
            }
          ]
        };
      }
      case "updateTicket": {
        const { ticketNumber, type: type2, priority } = args;
        if (!type2 && !priority) {
          throw new Error("At least one of type or priority must be specified");
        }
        const output = await executeOperation(
          "update-ticket",
          { ticket: ticketNumber, type: type2, priority, "data-dir": trackerConfig.dataDir },
          async () => {
            const result = await createTicketOperations(trackerConfig.dataDir).updateTicket(
              ticketNumber,
              { type: type2, priority }
            );
            return {
              messages: [
                `\u{1F3AB} Updated ticket #${ticketNumber}: ${result.ticket.title}`,
                ...result.changes.length > 0 ? ["\u2705 Changes made:", ...result.changes.map((ch) => `   \u2022 ${ch}`)] : ["\u2139\uFE0F  No changes made - properties already have the specified values"],
                ...result.messages
              ]
            };
          }
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Updated ticket #${ticketNumber}`
            }
          ]
        };
      }
      case "logWorkSession": {
        const { ticketNumber, action, agent = "mcp-client", summary, tokens = 0 } = args;
        const output = await executeOperation(
          "log-work-session",
          {
            ticket: ticketNumber,
            action,
            agent,
            summary,
            tokens,
            "data-dir": trackerConfig.dataDir
          },
          async () => {
            const result = await logWorkSession({
              ticketNumber,
              action,
              agent,
              summary,
              tokens,
              dataPath: trackerConfig.dataDir
            });
            return { messages: [...result.messages, ...result.warnings] };
          }
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Logged work session for ticket #${ticketNumber}`
            }
          ]
        };
      }
      case "updateWorkSessionPrompts": {
        const { ticketNumber, claudeDataPath } = args;
        const output = await executeOperation(
          "log-work-session",
          {
            ticket: ticketNumber,
            action: "update",
            agent: "mcp-client",
            "claude-data": claudeDataPath,
            "data-dir": trackerConfig.dataDir
          },
          async () => {
            const result = await logWorkSession({
              ticketNumber,
              action: "update",
              agent: "mcp-client",
              summary: "Updating work session with prompts",
              dataPath: trackerConfig.dataDir,
              claudeDataPath
            });
            return { messages: [...result.messages, ...result.warnings] };
          }
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Updated work session prompts for ticket #${ticketNumber}`
            }
          ]
        };
      }
      case "listWorkSessions": {
        const { ticketNumber, agent, startDate, endDate, outputFormat = "table", maxChars = DEFAULT_MAX_CHARS } = args;
        const output = await listWorkSessions(trackerConfig.dataDir, {
          ticketNumber,
          agent,
          startDate,
          endDate,
          output: outputFormat,
          maxChars
        });
        return {
          content: [
            {
              type: "text",
              text: output || "No work sessions found"
            }
          ]
        };
      }
      case "editFeature": {
        const { featureName, title, description, priority, assignee } = args;
        if (!title && !description && !priority && !assignee) {
          throw new Error("At least one of title, description, priority, or assignee must be specified");
        }
        const output = await executeOperation(
          "edit-feature",
          { name: featureName, title, description, priority, assignee, "data-dir": trackerConfig.dataDir },
          () => createFeatureOperations(trackerConfig.dataDir).editFeature(featureName, {
            title,
            description,
            priority,
            assignee
          })
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Updated feature: ${featureName}`
            }
          ]
        };
      }
      // Advanced MCP Feature implementations
      case "bulkCreateTickets": {
        const { tickets } = args;
        const results = {
          successful: [],
          failed: [],
          summary: ""
        };
        const trackerFs = new TrackerFileSystem(trackerConfig.dataDir);
        for (const ticket of tickets) {
          try {
            const { id, feature, title, description, type: type2 = "task", priority = "medium", labels = [], implementation_steps } = ticket;
            const created = await createTicketOperations(trackerConfig.dataDir).createTicket({
              feature,
              title,
              description,
              type: type2,
              priority,
              labels: Array.isArray(labels) ? labels : []
            });
            logScriptExecution(
              "create-ticket",
              ["--feature", feature, "--title", title, "--data-dir", trackerConfig.dataDir],
              created.messages.join("\n") + "\n",
              void 0,
              0,
              trackerConfig.dataDir
            );
            if (Array.isArray(implementation_steps) && implementation_steps.length > 0) {
              const ticketData = await trackerFs.readTicket(created.path);
              ticketData.implementation_steps = implementation_steps.map((step) => ({
                id: step.id,
                action: step.action,
                description: step.description,
                file: step.file,
                command: step.command,
                expected_result: step.expected_result,
                status: step.status || "pending",
                code: step.code
              }));
              ticketData.current_step = 1;
              await trackerFs.writeTicket(created.path, ticketData);
            }
            results.successful.push({ id, result: `Created ticket: ${title}` });
          } catch (error) {
            results.failed.push({ id: ticket.id, error: error instanceof Error ? error.message : String(error) });
          }
        }
        results.summary = `Bulk create completed: ${results.successful.length} successful, ${results.failed.length} failed`;
        const output = [
          results.summary,
          "",
          "\u2705 Successful:",
          ...results.successful.map((s) => `  \u2022 ${s.id}: ${s.result}`),
          "",
          "\u274C Failed:",
          ...results.failed.map((f) => `  \u2022 ${f.id}: ${f.error}`)
        ].join("\n");
        return {
          content: [
            {
              type: "text",
              text: output
            }
          ]
        };
      }
      case "bulkUpdateTicketStatus": {
        const { updates } = args;
        const results = {
          successful: [],
          failed: [],
          summary: ""
        };
        for (const update of updates) {
          try {
            const { id, ticketNumber, newStatus } = update;
            await executeOperation(
              "move-ticket",
              { ticket: ticketNumber, status: newStatus, "data-dir": trackerConfig.dataDir },
              () => createTicketOperations(trackerConfig.dataDir).moveTicket(ticketNumber, newStatus)
            );
            results.successful.push({ id, result: `Updated ticket #${ticketNumber} to ${newStatus}` });
          } catch (error) {
            results.failed.push({ id: update.id, error: error instanceof Error ? error.message : String(error) });
          }
        }
        results.summary = `Bulk status update completed: ${results.successful.length} successful, ${results.failed.length} failed`;
        const output = [
          results.summary,
          "",
          "\u2705 Successful:",
          ...results.successful.map((s) => `  \u2022 ${s.id}: ${s.result}`),
          "",
          "\u274C Failed:",
          ...results.failed.map((f) => `  \u2022 ${f.id}: ${f.error}`)
        ].join("\n");
        return {
          content: [
            {
              type: "text",
              text: output
            }
          ]
        };
      }
      case "bulkAddComments": {
        const { comments } = args;
        const results = {
          successful: [],
          failed: [],
          summary: ""
        };
        for (const comment of comments) {
          try {
            const { id, ticketNumber, text, author = "mcp-client" } = comment;
            await executeOperation(
              "add-comment",
              { ticket: ticketNumber, author, "data-dir": trackerConfig.dataDir },
              () => createTicketOperations(trackerConfig.dataDir).addComment(ticketNumber, text, author)
            );
            results.successful.push({ id, result: `Added comment to ticket #${ticketNumber}` });
          } catch (error) {
            results.failed.push({ id: comment.id, error: error instanceof Error ? error.message : String(error) });
          }
        }
        results.summary = `Bulk comments completed: ${results.successful.length} successful, ${results.failed.length} failed`;
        const output = [
          results.summary,
          "",
          "\u2705 Successful:",
          ...results.successful.map((s) => `  \u2022 ${s.id}: ${s.result}`),
          "",
          "\u274C Failed:",
          ...results.failed.map((f) => `  \u2022 ${f.id}: ${f.error}`)
        ].join("\n");
        return {
          content: [
            {
              type: "text",
              text: output
            }
          ]
        };
      }
      case "advancedTicketSearch": {
        const { query, aggregations = [], sort = [], limit, offset = 0 } = args;
        const stdout = await listTickets(trackerConfig.dataDir, { output: "json" });
        let tickets = [];
        try {
          const allTickets = JSON.parse(stdout || "[]");
          tickets = allTickets.map((ticket) => ({
            path: `${ticket.status}/${ticket.feature}/ticket-${String(ticket.ticket_number).padStart(4, "0")}-${ticket.title.toLowerCase().replace(/\s+/g, "-").substring(0, 30)}.yaml`,
            ticket
          }));
        } catch (parseError) {
          serverLogger.error("Failed to parse ticket data:", parseError);
          throw new Error("Failed to retrieve ticket data");
        }
        if (query && query.conditions) {
          const { conditions, logic = "AND" } = query;
          tickets = tickets.filter(({ ticket }) => {
            const results = conditions.map((condition) => {
              const { field, operator, value } = condition;
              const fieldValue = ticket[field];
              switch (operator) {
                case "equals":
                  return fieldValue === value;
                case "contains":
                  return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
                case "startsWith":
                  return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
                case "endsWith":
                  return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
                case "regex":
                  return new RegExp(value, "i").test(String(fieldValue));
                case "gt":
                  return Number(fieldValue) > Number(value);
                case "lt":
                  return Number(fieldValue) < Number(value);
                case "gte":
                  return Number(fieldValue) >= Number(value);
                case "lte":
                  return Number(fieldValue) <= Number(value);
                case "in":
                  return Array.isArray(value) && value.includes(fieldValue);
                case "notIn":
                  return Array.isArray(value) && !value.includes(fieldValue);
                default:
                  return false;
              }
            });
            return logic === "AND" ? results.every(Boolean) : results.some(Boolean);
          });
        }
        if (sort.length > 0) {
          tickets.sort((a, b) => {
            for (const sortConfig of sort) {
              const { field, direction = "asc" } = sortConfig;
              const aValue = a.ticket[field];
              const bValue = b.ticket[field];
              let comparison = 0;
              if (aValue != null && bValue != null) {
                if (aValue < bValue) comparison = -1;
                else if (aValue > bValue) comparison = 1;
              }
              if (direction === "desc") comparison *= -1;
              if (comparison !== 0) return comparison;
            }
            return 0;
          });
        }
        const totalResults = tickets.length;
        if (limit) {
          tickets = tickets.slice(offset, offset + limit);
        }
        const aggregationResults = {};
        for (const agg of aggregations) {
          const { type: type2, field } = agg;
          switch (type2) {
            case "count":
              aggregationResults.count = totalResults;
              break;
            case "groupBy":
              if (field) {
                const groups = {};
                tickets.forEach(({ ticket }) => {
                  const value = ticket[field];
                  groups[String(value)] = (groups[String(value)] || 0) + 1;
                });
                aggregationResults.groupBy = groups;
              }
              break;
            case "avg":
            case "sum":
            case "min":
            case "max":
              if (field) {
                const values = tickets.map(
                  ({ ticket }) => Number(ticket[field])
                ).filter((v) => !isNaN(v));
                if (values.length > 0) {
                  switch (type2) {
                    case "avg":
                      aggregationResults[type2] = values.reduce((a, b) => a + b, 0) / values.length;
                      break;
                    case "sum":
                      aggregationResults[type2] = values.reduce((a, b) => a + b, 0);
                      break;
                    case "min":
                      aggregationResults[type2] = Math.min(...values);
                      break;
                    case "max":
                      aggregationResults[type2] = Math.max(...values);
                      break;
                  }
                }
              }
              break;
          }
        }
        const ticketSummaries = tickets.map(
          ({ ticket }) => `#${ticket.ticket_number}: ${ticket.title} (${ticket.status}) - ${ticket.feature}`
        );
        const output = [
          `\u{1F50D} Advanced Search Results (${tickets.length}/${totalResults} tickets):`,
          "",
          ...ticketSummaries,
          "",
          "\u{1F4CA} Aggregations:",
          ...Object.entries(aggregationResults).map(
            ([key, value]) => `  \u2022 ${key}: ${typeof value === "object" ? JSON.stringify(value, null, 2) : value}`
          )
        ].join("\n");
        return {
          content: [
            {
              type: "text",
              text: output
            }
          ]
        };
      }
      case "manageTicketDependencies": {
        const { operation, ticketNumber, dependsOn = [], blocks = [] } = args;
        const dependencyOps = createDependencyOperations(trackerConfig.dataDir);
        const run = () => {
          switch (operation) {
            case "add":
            case "remove": {
              if (!ticketNumber) {
                throw new Error("ticketNumber is required for " + operation + " operation");
              }
              const input = { ticketNumber, dependsOn, blocks };
              return operation === "add" ? dependencyOps.addDependencies(input) : dependencyOps.removeDependencies(input);
            }
            case "list":
              return dependencyOps.listDependencies(ticketNumber);
            case "analyze":
              return dependencyOps.analyzeDependencies();
            default:
              throw new Error(`Unknown dependency operation: ${operation}`);
          }
        };
        const output = await executeOperation(
          "manage-dependencies",
          {
            [operation]: true,
            ...ticketNumber ? { ticket: ticketNumber } : {},
            ...dependsOn.length > 0 ? { "depends-on": dependsOn.join(",") } : {},
            ...blocks.length > 0 ? { blocks: blocks.join(",") } : {},
            "data-dir": trackerConfig.dataDir
          },
          run
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Dependency operation '${operation}' completed`
            }
          ]
        };
      }
      case "subscribeToTicketChanges": {
        const { action, filters = {} } = args;
        switch (action) {
          case "start":
            ticketEvents.startWatching();
            const handleTicketChange = (event) => {
              const { type: type2, filename, status, feature, timestamp: timestamp2 } = event;
              let shouldNotify = true;
              if (filters.status && !filters.status.includes(status)) {
                shouldNotify = false;
              }
              if (filters.features && !(feature !== void 0 && filters.features.includes(feature))) {
                shouldNotify = false;
              }
              if (shouldNotify) {
                console.error(`\u{1F514} Ticket change detected: ${filename} (${type2}) at ${timestamp2}`);
              }
            };
            ticketEvents.on("ticketChange", handleTicketChange);
            return {
              content: [
                {
                  type: "text",
                  text: "\u2705 Started real-time ticket change subscription"
                }
              ]
            };
          case "stop":
            ticketEvents.stopWatching();
            ticketEvents.removeAllListeners("ticketChange");
            return {
              content: [
                {
                  type: "text",
                  text: "\u2705 Stopped real-time ticket change subscription"
                }
              ]
            };
          case "status":
            const watcherCount = ticketEvents.listenerCount("ticketChange");
            const isWatching = ticketEvents.watchers?.size > 0;
            return {
              content: [
                {
                  type: "text",
                  text: `\u{1F4CA} Subscription Status:
\u2022 Active: ${isWatching}
\u2022 Listeners: ${watcherCount}`
                }
              ]
            };
          default:
            throw new Error(`Unknown subscription action: ${action}`);
        }
      }
      case "generateAnalytics": {
        const { reportType, timeRange, filters = {}, format = "summary" } = args;
        const analyticsFilters = {
          ...filters.features?.length > 0 ? { features: filters.features } : {},
          ...filters.assignees?.length > 0 ? { assignees: filters.assignees } : {},
          ...filters.types?.length > 0 ? { types: filters.types } : {},
          ...timeRange?.start || timeRange?.end ? {
            timeRange: {
              start: timeRange.start ?? "2000-01-01",
              end: timeRange.end ?? (/* @__PURE__ */ new Date()).toISOString()
            }
          } : {}
        };
        const output = await executeOperation(
          "generate-analytics",
          {
            "report-type": reportType,
            format,
            ...timeRange?.start ? { "time-range-start": timeRange.start } : {},
            ...timeRange?.end ? { "time-range-end": timeRange.end } : {},
            ...filters.features?.length > 0 ? { "filter-features": filters.features.join(",") } : {},
            ...filters.assignees?.length > 0 ? { "filter-assignees": filters.assignees.join(",") } : {},
            ...filters.types?.length > 0 ? { "filter-types": filters.types.join(",") } : {},
            "data-dir": trackerConfig.dataDir
          },
          () => runAnalyticsReport(trackerConfig.dataDir, {
            reportType,
            filters: analyticsFilters,
            format
          })
        );
        return {
          content: [
            {
              type: "text",
              text: output || "\u2705 Analytics report generated"
            }
          ]
        };
      }
      case "healthCheck": {
        const { detailed = false } = args;
        try {
          const healthResult = await processManager.getHealthStatus();
          let output = [
            `\u{1F3E5} Health Check Results:`,
            ``,
            `\u{1F4CA} Overall Status: ${healthResult.status.toUpperCase()}`,
            `\u23F1\uFE0F  Uptime: ${healthResult.uptime} seconds`,
            `\u{1F30D} Environment: ${healthResult.environment}`,
            `\u{1F4E6} Version: ${healthResult.version}`,
            `\u{1F516} Bundle: ${formatBundleLine(bundleVersion)}`,
            ``,
            `\u{1F50D} System Checks:`
          ];
          Object.entries(healthResult.checks).forEach(([checkName, check]) => {
            const statusIcon = check.status === "pass" ? "\u2705" : check.status === "warn" ? "\u26A0\uFE0F" : "\u274C";
            output.push(`  ${statusIcon} ${checkName}: ${check.message}`);
            if (check.responseTime) {
              output.push(`    Response time: ${check.responseTime}ms`);
            }
          });
          if (detailed) {
            const processMetrics = processManager.getProcessMetrics();
            const performanceMetrics = metricsCollector.getPerformanceMetrics();
            output.push("");
            output.push("\u{1F4C8} Detailed Metrics:");
            output.push(`  Memory: ${(processMetrics.memory.rss / 1024 / 1024).toFixed(1)}MB RSS`);
            output.push(`  Heap: ${(processMetrics.memory.heapUsed / 1024 / 1024).toFixed(1)}MB used / ${(processMetrics.memory.heapTotal / 1024 / 1024).toFixed(1)}MB total`);
            output.push(`  Requests: ${performanceMetrics.requestCount} total, ${performanceMetrics.errorCount} errors`);
            output.push(`  Avg Response: ${performanceMetrics.requestDuration.avg.toFixed(2)}ms`);
            output.push(`  Platform: ${processMetrics.platform} ${processMetrics.arch}`);
            output.push(`  Node.js: ${processMetrics.version}`);
            output.push(`  PID: ${processMetrics.pid}`);
          }
          return {
            content: [
              {
                type: "text",
                text: output.join("\n")
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `\u274C Health check failed: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
      case "getMetrics": {
        const { format = "json", duration } = args;
        try {
          if (format === "prometheus") {
            const prometheusMetrics = metricsCollector.exportPrometheusMetrics();
            return {
              content: [
                {
                  type: "text",
                  text: prometheusMetrics
                }
              ]
            };
          }
          const performanceMetrics = metricsCollector.getPerformanceMetrics();
          const processMetrics = processManager.getProcessMetrics();
          const metricsData = {
            performance: performanceMetrics,
            process: {
              pid: processMetrics.pid,
              uptime: processMetrics.uptime,
              memory: processMetrics.memory,
              cpu: processMetrics.cpu,
              platform: processMetrics.platform,
              arch: processMetrics.arch,
              nodeVersion: processMetrics.version
            },
            metricNames: metricsCollector.getMetricNames(),
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          };
          if (duration) {
            metricsData.history = {};
            metricsCollector.getMetricNames().forEach((metricName) => {
              metricsData.history[metricName] = metricsCollector.getMetricHistory(metricName, duration);
            });
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(metricsData, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `\u274C Failed to get metrics: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
      case "queryActivity": {
        try {
          const result = await queryActivity(trackerConfig.dataDir, {
            from: args?.from,
            to: args?.to,
            feature: args?.feature,
            ticket: args?.ticket,
            types: args?.types,
            groupBy: args?.groupBy,
            limit: args?.limit
          });
          return {
            content: [
              {
                type: "text",
                text: `${formatActivitySummary(result)}

${JSON.stringify(result, null, 2)}`
              }
            ]
          };
        } catch (error) {
          serverLogger.error("Failed to query activity", error);
          return {
            content: [
              {
                type: "text",
                text: `\u274C Failed to query activity: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
      case "getTokenMetrics": {
        try {
          const metrics = await getTokenMetrics(trackerConfig.dataDir, {
            ticketNumber: args?.ticketNumber,
            feature: args?.feature,
            timeRange: args?.timeRange
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(metrics, null, 2)
              }
            ]
          };
        } catch (error) {
          serverLogger.error("Failed to get token metrics", error);
          return {
            content: [
              {
                type: "text",
                text: `\u274C Failed to get token metrics: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
      case "getTokenCostReport": {
        try {
          const report = await getTokenCostReport(trackerConfig.dataDir, {
            feature: args?.feature,
            dateRange: args?.dateRange
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(report, null, 2)
              }
            ]
          };
        } catch (error) {
          serverLogger.error("Failed to get token cost report", error);
          return {
            content: [
              {
                type: "text",
                text: `\u274C Failed to get token cost report: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
      case "getActiveTokenMonitor": {
        try {
          const status = await getActiveTokenMonitor();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(status, null, 2)
              }
            ]
          };
        } catch (error) {
          serverLogger.error("Failed to get active token monitor", error);
          return {
            content: [
              {
                type: "text",
                text: `\u274C Failed to get active token monitor: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
      case "listActiveSessions": {
        const { agent, staleThreshold = 24, onlyStale = false, outputFormat = "table", maxChars = DEFAULT_MAX_CHARS } = args;
        try {
          const output = await listActiveSessions(trackerConfig.dataDir, {
            agent,
            staleThreshold,
            onlyStale,
            output: outputFormat === "json" ? "json" : "table",
            maxChars
          });
          return {
            content: [
              {
                type: "text",
                text: output || "No active sessions found"
              }
            ]
          };
        } catch (error) {
          serverLogger.error("Failed to list active sessions", error);
          return {
            content: [
              {
                type: "text",
                text: `\u274C Failed to list active sessions: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
      case "getProcessInfo": {
        try {
          const processMetrics = processManager.getProcessMetrics();
          const serverConfig2 = config.getServerConfig();
          const trackerConfig2 = config.getTrackerConfig();
          const loggingConfig = config.getLoggingConfig();
          const monitoringConfig = config.getMonitoringConfig();
          const processInfo = {
            // First, because "which build am I talking to" is the question this
            // tool gets asked when something looks wrong (#319). serverConfig
            // .version below is the static package.json number and answers it
            // for nobody.
            bundle: describeBundle(bundleVersion),
            server: {
              name: serverConfig2.name,
              version: serverConfig2.version,
              environment: config.getEnvironment(),
              startTime: new Date(Date.now() - processMetrics.uptime * 1e3).toISOString(),
              uptime: processMetrics.uptime
            },
            process: {
              pid: processMetrics.pid,
              platform: processMetrics.platform,
              arch: processMetrics.arch,
              nodeVersion: processMetrics.version,
              memory: {
                rss: `${(processMetrics.memory.rss / 1024 / 1024).toFixed(1)}MB`,
                heapUsed: `${(processMetrics.memory.heapUsed / 1024 / 1024).toFixed(1)}MB`,
                heapTotal: `${(processMetrics.memory.heapTotal / 1024 / 1024).toFixed(1)}MB`,
                external: `${(processMetrics.memory.external / 1024 / 1024).toFixed(1)}MB`
              }
            },
            configuration: {
              dataDirectory: trackerConfig2.dataDir,
              scriptPath: trackerConfig2.scriptPath,
              scriptTimeout: `${trackerConfig2.scriptTimeout}ms`,
              logLevel: loggingConfig.level,
              logFormat: loggingConfig.format,
              logOutput: loggingConfig.output,
              healthCheck: monitoringConfig.healthCheck,
              metricsEnabled: monitoringConfig.metricsEnabled
            }
          };
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(processInfo, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `\u274C Failed to get process info: ${error.message}`
              }
            ],
            isError: true
          };
        }
      }
      case "updateImplementationStep": {
        const { ticketNumber, stepId, status } = args;
        const output = await executeOperation(
          "update-implementation-step",
          { ticket: ticketNumber, step: stepId, status, "data-dir": trackerConfig.dataDir },
          () => createTicketOperations(trackerConfig.dataDir).updateImplementationStep(
            ticketNumber,
            stepId,
            status
          )
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Updated step ${stepId} to '${status}' on ticket #${ticketNumber}`
            }
          ]
        };
      }
      case "recordVerification": {
        const { ticketNumber, testsPassed, testCommand, testOutput, buildPassed, buildCommand } = args;
        const output = await executeOperation(
          "record-verification",
          {
            ticket: ticketNumber,
            "tests-passed": testsPassed,
            "test-command": testCommand,
            "build-passed": buildPassed,
            "build-command": buildCommand,
            "data-dir": trackerConfig.dataDir
          },
          () => createTicketOperations(trackerConfig.dataDir).recordVerification(ticketNumber, {
            ...testsPassed !== void 0 ? { tests_passed: testsPassed } : {},
            ...testCommand ? { test_command: testCommand } : {},
            ...testOutput ? { test_output: testOutput } : {},
            ...buildPassed !== void 0 ? { build_passed: buildPassed } : {},
            ...buildCommand ? { build_command: buildCommand } : {}
          })
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Recorded verification on ticket #${ticketNumber}`
            }
          ]
        };
      }
      case "updateChecklist": {
        const { ticketNumber, index, checked } = args;
        const output = await executeOperation(
          "update-checklist",
          { ticket: ticketNumber, index, checked, "data-dir": trackerConfig.dataDir },
          () => createTicketOperations(trackerConfig.dataDir).updateChecklist(
            ticketNumber,
            index,
            checked
          )
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Updated checklist item ${index} on ticket #${ticketNumber}`
            }
          ]
        };
      }
      case "updateFeatureDesign": {
        const { featureName, approach, decisions = [], approved } = args;
        const output = await executeOperation(
          "update-feature-design",
          {
            feature: featureName,
            approach,
            ...decisions.length > 0 ? { decisions: decisions.join(",") } : {},
            ...approved ? { approved: true } : {},
            "data-dir": trackerConfig.dataDir
          },
          () => createFeatureOperations(trackerConfig.dataDir).updateDesign(featureName, {
            approach,
            decisions: decisions.length > 0 ? decisions : void 0,
            approved: !!approved
          })
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Updated design on feature '${featureName}'`
            }
          ]
        };
      }
      case "updateFeaturePlan": {
        const { featureName, phases } = args;
        const output = await executeOperation(
          "update-feature-plan",
          { feature: featureName, "data-dir": trackerConfig.dataDir },
          () => createFeatureOperations(trackerConfig.dataDir).updatePlan(featureName, {
            // The tool accepts phases as a JSON string, matching the CLI flag.
            phases: typeof phases === "string" ? JSON.parse(phases) : phases
          })
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Updated plan on feature '${featureName}'`
            }
          ]
        };
      }
      case "updateFeatureReview": {
        const { featureName, status, reviewer, notes } = args;
        const output = await executeOperation(
          "update-feature-review",
          { feature: featureName, status, reviewer, notes, "data-dir": trackerConfig.dataDir },
          () => createFeatureOperations(trackerConfig.dataDir).updateReview(featureName, {
            status,
            reviewer,
            notes
          })
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Updated review on feature '${featureName}'`
            }
          ]
        };
      }
      case "updateFeatureWorktree": {
        const { featureName, branch, path: worktreePath } = args;
        const output = await executeOperation(
          "update-feature-worktree",
          { feature: featureName, branch, path: worktreePath, "data-dir": trackerConfig.dataDir },
          () => createFeatureOperations(trackerConfig.dataDir).updateWorktree(featureName, {
            branch,
            path: worktreePath
          })
        );
        return {
          content: [
            {
              type: "text",
              text: output || `\u2705 Updated worktree on feature '${featureName}'`
            }
          ]
        };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `\u274C Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
});
async function main() {
  try {
    serverLogger.info("Starting MCP server", {
      name: serverConfig.server.name,
      version: serverConfig.server.version,
      environment: config.getEnvironment(),
      dataDir: trackerConfig.dataDir
    });
    processManager.registerCleanupHandler(async () => {
      serverLogger.info("Shutting down file watching system");
      ticketEvents.stopWatching();
    });
    processManager.registerCleanupHandler(async () => {
      serverLogger.info("Cleaning up server connections");
    });
    processManager.on("ready", async () => {
      try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        ticketEvents.startWatching();
        serverLogger.info("\u{1F680} MCP Server started successfully", {
          transport: "stdio",
          monitoring: config.isHealthCheckEnabled(),
          metrics: config.isMetricsEnabled()
        });
        exitRecorder.recordStartup({
          message: "stdio transport connected",
          ...bundleVersion.gitCommit !== "unknown" ? { bundleCommit: bundleVersion.gitCommit } : {}
        });
        void reportVersionSkew().then((shouldRefuse) => {
          if (shouldRefuse) {
            console.error("  \u26D4 TRACKER_STRICT_VERSION=1 and versions differ \u2014 refusing to serve.");
            exitRecorder.record("startup-failure", {
              message: "version skew with TRACKER_STRICT_VERSION=1",
              terminal: true
            });
            processManager.forceShutdown(1);
          }
        });
      } catch (error) {
        const err = error;
        serverLogger.error("Failed to start MCP server", err);
        exitRecorder.record("startup-failure", {
          message: err.message,
          stack: err.stack,
          terminal: true
        });
        processManager.forceShutdown(1);
      }
    });
    processManager.on("error", (error) => {
      serverLogger.error("Process manager error", error);
    });
    processManager.on("shutdown", (signal) => {
      serverLogger.info("Graceful shutdown initiated", { signal });
    });
  } catch (error) {
    serverLogger.error("Failed to initialize MCP server", error);
    process.exit(1);
  }
}
main().catch((error) => {
  console.error("Fatal error starting MCP server:", error);
  process.exit(1);
});
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.0 https://github.com/nodeca/js-yaml @license MIT *)
*/
