// Import or create JGO namespace
var JGO = JGO || {};

// Import or create JGO.util namespace
JGO.util = JGO.util || {};

(function() {
    var ERROR; // error holder for sgfParse etc.

    var SGFProperties = {
        'B': sgfMove, 'W': sgfMove,
        'AB': sgfSetup, 'AW': sgfSetup, 'AE': sgfSetup,
        'C': sgfComment, 'LB': sgfLabel, 'HA': sgfHandicap,
        'TW': sgfMarker, 'TB': sgfMarker, 'CR': sgfMarker,
        'TR': sgfMarker, 'MA': sgfMarker, 'SQ': sgfMarker,
        'AN': sgfInfo, 'CP': sgfInfo, 'DT': sgfInfo,
        'EV': sgfInfo, 'GN': sgfInfo, 'OT': sgfInfo,
        'RO': sgfInfo, 'RE': sgfInfo, 'RU': sgfInfo,
        'SO': sgfInfo, 'TM': sgfInfo, 'PC': sgfInfo,
        'PB': sgfInfo, 'PW': sgfInfo, 'BR': sgfInfo,
        'WR': sgfInfo, 'BT': sgfInfo, 'WT': sgfInfo
    };

    var fieldMap = {
        "AN": "annotator", "CP": "copyright", "DT": "date",
        "EV": "event", "GN": "gameName", "OT": "overtime", "RO": "round",
        "RE": "result", "RU": "rules", "SO": "source", "TM": "time",
        "PC": "location", "PB": "black", "PW": "white", "BR": "blackRank",
        "WR": "whiteRank", "BT": "blackTeam", "WT": "whiteTeam"
    };

    function sgfMove(name, values) {
        var coord, player, opponent, node, play;

        if(name == "B") {
            player = JGO.BLACK;
            opponent = JGO.WHITE;
        } else if("W") {
            player = JGO.WHITE;
            opponent = JGO.BLACK;
        }

        coord = (values[0].length == 2) ? new JGO.Coordinate(values[0]) : null;

        play = this.jboard.playMove(coord, player); // Just ignore ko

        if(play.success && coord != null) {
            this.setType(coord, player); // play stone
            this.setType(play.captures, JGO.CLEAR); // clear opponent's stones
        } else ERROR = play.error;

        return play.success;
    }

    function sgfSetup(name, values) {
        var setupMap = {"AB": JGO.BLACK, "AW": JGO.WHITE, "AE": JGO.CLEAR};

        this.setType(explodeSGFList(values), setupMap[name]);
        return true;
    }

    function sgfMarker(name, values) {
        var markerMap = {
            "TW": ',', "TB": '.', "CR": '0', "TR": '/', "MA": '*', "SQ": '#'
        };

        this.mark(explodeSGFList(values), markerMap[name]);
        return true;
    }

    function sgfComment(name, values) {
        this.comment = values[0];
        return true;
    }

    function sgfHandicap(name, values) {
        this.info['handicap'] = values[0];
        return true;
    }

    function sgfLabel(name, values) {
        for(var i=0; i<values.length; i++) {
            var v = values[i], tuple = v.split(":");

            this.setMark(new JGO.Coordinate(tuple[0]), tuple[1]);
        }
        return true;
    }

    function sgfInfo(name, values) {
        var field = fieldMap[name];

        this.info[field] = values[0];
        return true;
    }

    /**
    * Helper function to handle single coordinates as well as coordinate lists.
    *
    * @param {object} propValues A property value array containing a mix of coordinates (aa) and lists (aa:bb)
    * @returns {array} An array of JGO.Coordinate objects matching the given property values.
    */
    function explodeSGFList(propValues) {
        var coords = [];

        $.each(propValues, function(i, val) {
            if(val.indexOf(":") == -1) { // single coordinate
                coords.push(new JGO.Coordinate(val));
            } else {
                var tuple = v.split(":"), c1, c2;

                c1 = new JGO.Coordinate(tuple[0]);
                c2 = new JGO.Coordinate(tuple[1]);
                coord = new JGO.Coordinate();

                for(coord.i=c1.i; coord.i<=c2.i; ++coord.i)
                    for(coord.j=c1.j; coord.j<=c2.j; ++coord.j)
                        coords.push(coord.copy());
            }
        });

        return coords;
    }

    /**
    * Parse SGF string into object tree representation:
    *
    * tree = { sequence: [ <node(s)> ], leaves: [ <subtree(s), if any> ] }
    *
    * Each node is an object containing property identifiers and associated values in array:
    *
    * node = {"B": ["nn"], "C": ["This is a comment"]}
    *
    * @param {String} sgf The SGF in string format, whitespace allowed.
    * @returns {Object} Root node or false on error. Error stored to ERROR variable.
    */
    function parseSGF(sgf) {
        var tokens, i, len, token, // for loop vars
        lastBackslash = false, // flag to note if last string ended in escape
        bracketOpen = -1, // the index where bracket opened
        processed = [];

        if("a~b".split(/(~)/).length === 3) {
            tokens = sgf.split(/([\[\]\(\);])/); // split into an array at "[", "]", "(", ")", and ";", and include separators in array
        } else { // Thank you IE for not working
            var blockStart = 0, delimiters = "[]();";

            tokens = [];

            for(i=0, len=sgf.length; i<len; ++i) {
                if(delimiters.indexOf(sgf.charAt(i)) !== -1) {
                    if(blockStart < i)
                        tokens.push(sgf.substring(blockStart, i));
                    tokens.push(sgf.charAt(i));
                    blockStart = i+1;
                }
            }

            if(blockStart < i) // leftovers
                tokens.push(sgf.substr(blockStart, i));
        }

        // process through tokens and push everything into processed, but merge stuff between square brackets into one element, unescaping escaped brackets
        // i.e. ["(", ";", "C", "[", "this is a comment containing brackets ", "[", "\\", "]", "]"] becomes:
        // ["(", ";", "C", "[", "this is a comment containing brackets []]"]
        // after this transformation, it's just "(", ")", ";", "ID", and "[bracket stuff]" elements in the processed array
        for(i=0, len=tokens.length; i<len; ++i) {
            token = tokens[i];

            if(bracketOpen == -1) { // handling elements outside property values (i.e. square brackets)
                token = jQuery.trim(token); // trim whitespace, it is irrelevant here
            if(token == "[") // found one
                bracketOpen = i;
            else if(token != "") // we are outside brackets, so just push everything nonempty as it is into 'processed'
                processed.push(token);
            } else { // bracket is open, we're now looking for a ] without preceding \
                if(token != "]") { // a text segment
                    lastBackslash = (token.charAt(token.length-1) == "\\"); // true if string ends in \
                } else { // a closing bracket
                    if(lastBackslash) { // it's escaped - we continue
                        lastBackslash = false;
                    } else { // it's not escaped - we close the segment
                        processed.push(tokens.slice(bracketOpen, i+1).join('').replace(/\\\]/g, "]")); // push the whole thing including brackets, and unescape the inside closing brackets
                        bracketOpen = -1;
                    }
                }
            }
        }

        // basic error checking
        if(processed.length == 0) {
            ERROR = "SGF was empty!";
            return false;
        } else if(processed[0] != "(" || processed[1] != ";" || processed[processed.length-1] != ")") {
            ERROR = "SGF did not start with \"(;\" or end with \")\"!";
            return false;
        }

        // collect "XY", "[AB]", "[CD]" sequences (properties) in a node into {"XY": ["AB", "CD"]} type of associative array
        // effectively parsing "(;GM[1]FF[4];B[pd])" into ["(", {"GM": ["1"], "FF": ["4"]}, {"B": ["pd"]}, ")"]

        // start again with "tokens" and process into "processed"
        tokens = processed;
        processed = [];

        var node, propertyId = ""; // node under construction, and current property identifier

        // the following code is not strict on format, so let's hope it's well formed
        for(i=0, len=tokens.length; i<len; ++i) {
            token = tokens[i];

            if(token == "(" || token == ")") {
                if(node) { // flush and reset node if necessary
                    if(propertyId != "" && node[propertyId].length == 0) { // last property was missing value
                        ERROR = "Missing property value at " + token + "!";
                        return false;
                    }
                    processed.push(node);
                    node = undefined;
                }

                processed.push(token); // push this token also
            } else if(token == ";") { // new node
                if(node) { // flush if necessary
                    if(propertyId != "" && node[propertyId].length == 0) { // last property was missing value
                        ERROR = "Missing property value at " + token + "!";
                        return false;
                    }
                    processed.push(node);
                }

                node = {}; propertyId = ""; // initialize the new node
            } else { // it's either a property identifier or a property value
                if(token.indexOf("[") != 0) { // it's property identifier
                    if(propertyId != "" && node[propertyId].length == 0) { // last property was missing value
                        ERROR = "Missing property value at " + token + "!";
                        return false;
                    }

                    if(token in node) { // duplicate key
                        ERROR = "Duplicate property identifier " + token + "!";
                        return false;
                    }

                    propertyId = token;
                    node[propertyId] = []; // initialize new property with empty value array
                } else { // it's property value
                    if(propertyId == "") { // we're missing the identifier
                        ERROR = "Missing property identifier at " + token + "!";
                        return false;
                    }

                    node[propertyId].push(token.substring(1, token.length-1)); // remove enclosing brackets
                }
            }
        }

        tokens = processed;

        // finally, construct a game tree from "(", ")", and sequence arrays - each leaf is {sequence: [ <list of nodes> ], leaves: [ <list of leaves> ]}
        var stack = [], currentRoot = {sequence: [], leaves: []}, lastRoot; // we know first element already: "("

        for(i=1, len=tokens.length; i<len-1; ++i) {
            token = tokens[i];

            if(token == "(") { // enter a subleaf
                if(currentRoot.sequence.length == 0) { // consecutive parenthesis without node sequence in between will throw an error
                    ERROR = "SGF contains a game tree without a sequence!";
                    return false;
                }
                stack.push(currentRoot); // save current leaf for when we return
                currentRoot = {sequence: [], leaves: []};
            } else if(token == ")") { // return from subleaf
                if(currentRoot.sequence.length == 0) { // consecutive parenthesis without node sequence in between will throw an error
                    ERROR = "SGF contains a game tree without a sequence!";
                    return false;
                }
                lastRoot = currentRoot;
                currentRoot = stack.pop();
                currentRoot.leaves.push(lastRoot);
            } else { // if every "(" is not followed by exactly one array of nodes (as it should), this code fails
                currentRoot.sequence.push(token);
            }
        }

        if(stack.length > 0) {
            ERROR = "Invalid number of parentheses in the SGF!";
            return false;
        }

        return currentRoot;
    }

    /**
     * Convert game tree to a record.
     * @returns {Object} JGO.Record or false on failure. Error stored in ERROR.
     */
    function gameTreeToRecord(gameTree) {
        var jrecord, root = gameTree.sequence[0];

        if("SZ" in root) {
            var size = root.SZ[0];

            if(size.indexOf(':') != -1) {
                width = parseInt(size.substring(0, size.indexOf(':')));
                height = parseInt(size.substr(size.indexOf(':')+1));
            } else width = height = parseInt(size);
        } else
            width = height = 19;

        jrecord = new JGO.Record(width, height);

        if(!recurseRecord(jrecord, gameTree))
            return false;

        jrecord.first(); // rewind to start

        return jrecord;
    }

    /**
     * Apply SGF nodes recursively to create a game tree.
     * @returns true on success, false on error. Error message in ERROR.
     */
    function recurseRecord(jrecord, gameTree) {
        for(var i=0; i<gameTree.sequence.length; i++) {
            var node = gameTree.sequence[i], jnode = jrecord.createNode();

            for(var key in node) {
                if(!node.hasOwnProperty(key) || !(key in SGFProperties))
                    continue;

                if(!SGFProperties[key].call(jnode, key, node[key])) {
                    ERROR = 'Error while parsing node ' + key + ': ' + ERROR;
                    return false;
                }
            }
        }

        for(var i=0; i<gameTree.leaves.length; i++) {
            var subTree = gameTree.leaves[i], snapshot;

            snapshot = jrecord.createSnapshot();

            if(!recurseRecord(jrecord, subTree))
                return false; // fall through on errors

            jrecord.restoreSnapshot(snapshot);
        }

        return true;
    }

    /**
    * Parse SGF and return JGO.Record object(s).
    *
    * @returns {Object} JGO.Record object, array of them, or string on error.
    * @memberof JGO.util
    */
    JGO.util.loadSGF = function(sgf) {
        var gameTree = parseSGF(sgf);

        if(gameTree.sequence.length == 0) { // potentially multiple game records
            var ret = [];

            if(gameTree.leaves.length == 0)
                return 'Empty game tree!';

            for(var i=0; i<gameTree.leaves.length; i++) {
                var rec = gameTreeToRecord(gameTree);

                if(!rec)
                    return ERROR;

                ret.push(rec); // return each leaf as separate record
            }

            return ret;
        }

        return gameTreeToRecord(gameTree);
    }

})();
