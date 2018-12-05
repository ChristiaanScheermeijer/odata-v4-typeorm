"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const odata_v4_literal_1 = require("odata-v4-literal");
const visitor_1 = require("odata-v4-sql/lib/visitor");
class TypeOrmVisitor extends visitor_1.Visitor {
    constructor(options) {
        super(options);
        //parameters:any[] = [];
        this.includes = [];
        this.alias = ''; // 'typeorm_query';
        this.type = visitor_1.SQLLang.Oracle;
        this.alias = options.alias || this.alias;
    }
    from(table) {
        let sql = `SELECT ${this.select} FROM ${table} WHERE ${this.where} ORDER BY ${this.orderby}`;
        if (typeof this.skip == 'number')
            sql += ` OFFSET ${this.skip} ROWS`;
        if (typeof this.limit == 'number') {
            if (typeof this.skip != 'number')
                sql += ' OFFSET 0 ROWS';
            sql += ` FETCH NEXT ${this.limit} ROWS ONLY`;
        }
        return sql;
    }
    VisitExpand(node, context) {
        node.value.items.forEach((item) => {
            let expandPath = item.value.path.raw;
            let visitor = this.includes.filter(v => v.navigationProperty == expandPath)[0];
            if (!visitor) {
                visitor = new TypeOrmVisitor(this.options);
                visitor.parameterSeed = this.parameterSeed;
                this.includes.push(visitor);
            }
            visitor.Visit(item);
            this.parameterSeed = visitor.parameterSeed;
        });
    }
    VisitSelectItem(node, context) {
        let item = node.raw.replace(/\//g, '.');
        this.select += this.getIdentifier(item, context.identifier); //`${this.alias}.${item}`;
    }
    VisitODataIdentifier(node, context) {
        if (context.identifier && context.identifier.endsWith('.')) {
            this[context.target] += '.';
        }
        if (node.value.name === 'NULL') {
            this[context.target] += node.value.name;
        }
        else {
            const ident = this.getIdentifier(node.value.name, context); //`${this.alias ? this.alias + '.' : ''}${node.value.name}`;
            this[context.target] += ident;
        }
        context.identifier = /*this.getIdentifier(node.value.name, context); //*/ node.value.name;
    }
    getIdentifier(originalIdentifier, context) {
        let alias = '';
        //if (originalIdentifier.indexOf('.') === -1 ) {
        if (!context.identifier || !context.identifier.endsWith('.')) {
            alias = this.alias + '.';
        }
        else {
            this[context.target] = this[context.target].replace(new RegExp(this.alias + '.' + context.identifier, 'g'), context.identifier);
        }
        return `${alias}${originalIdentifier}`;
    }
    ;
    VisitEqualsExpression(node, context) {
        this.Visit(node.value.left, context);
        this.where += ' = ';
        this.Visit(node.value.right, context);
        if (this.options.useParameters && context.literal == null) {
            this.where = this.where.replace(/= :p\d*$/, 'IS NULL')
                .replace(new RegExp(`\\:p\\d* = ${context.identifier}$`), `${context.identifier} IS NULL`);
        }
        else if (context.literal == 'NULL') {
            this.where = this.where.replace(/= NULL$/, 'IS NULL')
                .replace(new RegExp(`NULL = ${context.identifier}$`), `${context.identifier} IS NULL`);
        }
    }
    VisitNotEqualsExpression(node, context) {
        this.Visit(node.value.left, context);
        this.where += ' <> ';
        this.Visit(node.value.right, context);
        if (this.options.useParameters && context.literal == null) {
            this.where = this.where.replace(/<> :p\d*$/, 'IS NOT NULL')
                .replace(new RegExp(`\\:p\\d* <> ${context.identifier}$`), `${context.identifier} IS NOT NULL`);
        }
        else if (context.literal == 'NULL') {
            this.where = this.where.replace(/<> NULL$/, 'IS NOT NULL')
                .replace(new RegExp(`NULL <> ${context.identifier}$`), `${context.identifier} IS NOT NULL`);
        }
    }
    VisitLiteral(node, context) {
        if (this.options.useParameters) {
            let name = `p${this.parameterSeed++}`;
            let value = odata_v4_literal_1.Literal.convert(node.value, node.raw);
            context.literal = value;
            if (context.literal != null) {
                this.parameters.set(name, value);
            }
            this.where += `:${name}`;
        }
        else
            this.where += (context.literal = visitor_1.SQLLiteral.convert(node.value, node.raw));
    }
    VisitMethodCallExpression(node, context) {
        var method = node.value.method;
        var params = node.value.parameters || [];
        switch (method) {
            case "contains":
                this.Visit(params[0], context);
                if (this.options.useParameters) {
                    let value = odata_v4_literal_1.Literal.convert(params[1].value, params[1].raw);
                    this.parameters.push(`%${value}%`);
                    this.where += ` like \$${this.parameters.length}`;
                }
                else
                    this.where += ` like '%${visitor_1.SQLLiteral.convert(params[1].value, params[1].raw).slice(1, -1)}%'`;
                break;
            case "endswith":
                this.Visit(params[0], context);
                if (this.options.useParameters) {
                    let value = odata_v4_literal_1.Literal.convert(params[1].value, params[1].raw);
                    this.parameters.push(`%${value}`);
                    this.where += ` like \$${this.parameters.length}`;
                }
                else
                    this.where += ` like '%${visitor_1.SQLLiteral.convert(params[1].value, params[1].raw).slice(1, -1)}'`;
                break;
            case "startswith":
                this.Visit(params[0], context);
                if (this.options.useParameters) {
                    let value = odata_v4_literal_1.Literal.convert(params[1].value, params[1].raw);
                    this.parameters.push(`${value}%`);
                    this.where += ` like \$${this.parameters.length}`;
                }
                else
                    this.where += ` like '${visitor_1.SQLLiteral.convert(params[1].value, params[1].raw).slice(1, -1)}%'`;
                break;
            case "substring":
                this.where += "SUBSTR(";
                this.Visit(params[0], context);
                this.where += ", ";
                this.Visit(params[1], context);
                this.where += " + 1";
                if (params[2]) {
                    this.where += ", ";
                    this.Visit(params[2], context);
                }
                else {
                    this.where += ", CHAR_LENGTH(";
                    this.Visit(params[0], context);
                    this.where += ")";
                }
                this.where += ")";
                break;
            case "substringof":
                this.Visit(params[1], context);
                if (params[0].value == "Edm.String") {
                    if (this.options.useParameters) {
                        let value = odata_v4_literal_1.Literal.convert(params[0].value, params[0].raw);
                        this.parameters.push(`%${value}%`);
                        this.where += ` like \$${this.parameters.length}`;
                    }
                    else
                        this.where += ` like '%${visitor_1.SQLLiteral.convert(params[0].value, params[0].raw).slice(1, -1)}%'`;
                }
                else {
                    this.where += " like ";
                    this.Visit(params[0], context);
                }
                break;
            case "concat":
                this.where += "(";
                this.Visit(params[0], context);
                this.where += " || ";
                this.Visit(params[1], context);
                this.where += ")";
                break;
            case "round":
                this.where += "ROUND(";
                this.Visit(params[0], context);
                this.where += ")";
                break;
            case "length":
                this.where += "CHAR_LENGTH(";
                this.Visit(params[0], context);
                this.where += ")";
                break;
            case "tolower":
                this.where += "LOWER(";
                this.Visit(params[0], context);
                this.where += ")";
                break;
            case "toupper":
                this.where += "UPPER(";
                this.Visit(params[0], context);
                this.where += ")";
                break;
            case "floor":
            case "ceiling":
            case "year":
            case "month":
            case "day":
            case "hour":
            case "minute":
            case "second":
                this.where += `${method.toUpperCase()}(`;
                this.Visit(params[0], context);
                this.where += ")";
                break;
            case "now":
                this.where += "NOW()";
                break;
            case "trim":
                this.where += "TRIM(BOTH ' ' FROM ";
                this.Visit(params[0], context);
                this.where += ")";
                break;
        }
    }
}
exports.TypeOrmVisitor = TypeOrmVisitor;
//# sourceMappingURL=visitor.js.map