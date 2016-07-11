#!/usr/bin/env node

const net=require("net"),
      kbd=require("kbd");


let host="localhost",port=1337;
if(process.argv.length>2){
	host=process.argv[2];
}
if(process.argv.length>3){
	port=+process.argv[3];
}


const YOURTURNX=14;


function write(...args){
	process.stdout.write(args.join(" "));
}

function prompt(pr,accept){
	if(!accept)accept=()=>true;
	let response;
	kbd.setEcho(true);
	kbd.setCanonical(true);
	while(true){
		moveto(0,2);
		write("Nickname: ");
		response=kbd.getLineSync();
		if(accept(response))break;
		moveto(0,3);
		write("Not accepted.");
	}
	kbd.setCanonical(false);
	kbd.setEcho(false);
	moveto(0,2);
	write("\x1B[K\n\x1B[K");
	return response;
}

let current_status_str="";

{
	let screen_inited=false;
	function screen_init(){
		if(!screen_inited){
			kbd.setEcho(false);
			kbd.setCanonical(false);
		}
		write("\x1B[2J\x1B[H\x1B[?1049h\x1B[1mMULTISWEEPER\x1B[0m                 (\x1B[1mq\x1B[0m to quit)   "+current_status_str);
		screen_inited=true;
	}

	function screen_end(){
		if(!screen_inited)return;
		kbd.setEcho(true);
		kbd.setCanonical(true);
		write("\x1B[?1049l");
		screen_inited=false;
	}
}

function moveto(x,y){
	write("\x1B["+(y+1)+";"+(x+1)+"H");
}

function bel(){
	write("\x07");
}

{
	let timeout=null;
	function show_status(s){
		if(timeout!=null)clearTimeout();
		moveto(43,0);
		write("\x1B[K"+s);
		current_status_str=s;
		moveto(2+2*cursor[0],2+cursor[1]);
		setTimeout(()=>show_status(""),5000);
	}
}

function board_draw(){
	moveto(0,1);
	const topline="+"+Array(2*size[0]+2).join("-")+"+";
	write(topline);

	let i=0;
	let clr,chr,rst,longclr,longchr;
	let nflags=0;
	for(let y=0;y<size[1];y++){
		moveto(0,y+2);
		write("| ");
		for(let x=0;x<size[0];x++,i++){
			nflags+=flags[i];
			if(changeds[size[0]*y+x]){
				clr="\x1B[45m";
				if(x<size[0]-1&&changeds[size[0]*y+x+1])longclr=true;
			} else if(flags[i])clr="\x1B[41m";
			else if(board[i]=="10")clr="\x1B[41;1m";
			else clr="";
			if(board[i]=="10")chr="#";
			else if(flags[i])chr="+";
			else if(board[i]=="9")chr=".";
			else if(board[i]=="0")chr=" ";
			else chr=board[i];
			rst=clr!=""?"\x1B[0m":"";
			longchr=x==size[0]-1?"|":" ";
			write(clr+chr+(longclr?" "+rst:rst+" "));
			longclr=false;
		}
		write("|");
	}
	moveto(0,size[1]+2);
	write(topline);

	moveto(2+2*size[0]+2,2+players.length+2);
	const left=numbombs-nflags;
	write(left+" bomb"+(left==1?"":"s")+" to go "+(left==0?":D":"D:")+"  ");
	moveto(2+2*cursor[0],2+cursor[1]);
}

function board_move(dir){
	switch(dir){
		case 0: if(cursor[1]>0)cursor[1]--; else bel(); break;
		case 1: if(cursor[0]<size[0]-1)cursor[0]++; else bel(); break;
		case 2: if(cursor[1]<size[1]-1)cursor[1]++; else bel(); break;
		case 3: if(cursor[0]>0)cursor[0]--; else bel(); break;
		default: throw "kaas";
	}
	moveto(2+2*cursor[0],2+cursor[1]);
}

function turn_id_update(id){
	id--;
	for(let i=0;i<players.length;i++){
		moveto(2+2*size[0]+2,i+2);
		if(i==id%players.length)write("\x1B[K\x1B[1m> ");
		else write("  ");
		write(players[i]);
		if(i==id%players.length)write("\x1B[0m");
	}
	moveto(2+2*cursor[0],2+cursor[1]);
}

function changeds_reset(){
	changeds=new Array(size[0]*size[1]).fill(false);
}

function sockonline(line){
	let cmd=line.split(" ");
	switch(cmd[0]){
		case "multisweeper":
			sock.write("multisweeper client v1\n");
			sock.write("name "+nickname+"\n");
			break;

		case "num_players":
			screen_init();
			num_players=+cmd[1];
			players=[];
			break;

		case "player":
			players.push(cmd[1]);
			break;

		case "start":
			size=[+cmd[1],+cmd[2]];
			numbombs=+cmd[3];
			board=new Array(size[0]*size[1]).fill("9");
			flags=new Array(size[0]*size[1]).fill(false);
			changeds_reset();
			board_draw();
			break;

		case "board_update":
			changeds_reset();
			for(let i=0;i<size[0]*size[1];i++){
				if(cmd[i+1]!=board[i]){
					board[i]=cmd[i+1];
					changeds[i]=true;
					if(board[i]!="9"&&board[i]!="10"&&flags[i])flags[i]=false;
				}
			}
			board_draw();
			break;

		case "turn_id_update":
			turn_id_update(+cmd[1]);
			break;

		case "turn_start":
			canclick=true;
			moveto(YOURTURNX,0);
			write("(your turn!)");
			bel();
			board_draw();
			break;

		case "end_condition":
			endcondition=+cmd[1];
			if(cmd[1]=="2"){
				screen_end();
				sock.end();
				console.log("You won the competition! Congratulations!");
				setTimeout(()=>process.kill(process.pid),100);
			} else if(cmd[1]=="1"){
				show_status("You won the game! Good luck in the next game.");
			} else {
				show_status("You lost the game... You're now a spectator.");
			}
			break;

		case "sudden_exit":
			screen_end();
			console.log("Sudden exit received from server! Killing myself...");
			process.kill(process.pid); //process.exit(1) doesn't seem to work?
	}
}


screen_init();

const sock=net.connect(port,host);
const nickname=prompt("Nickname: ",(s)=>s.length>0);
let num_players=null;
let players=[];
let size=[null,null];
let numbombs=null;
let cursor=[0,0];
let canclick=false;
let board=[],flags=[],changeds=[];
let endcondition=-1;


{
	let buf="";
	sock.on("data",function(data){
		buf+=data.toString();
		while(true){
			let idx=buf.indexOf("\n");
			if(idx==-1)break;
			let line=buf.slice(0,idx);
			buf=buf.slice(idx+1);
			sockonline(line);
		}
	});
}

sock.on("error",function(err){
	write("SOCKET ERROR:",err);
});

sock.on("end",function(){
	screen_end();
	if(endcondition==0){
		console.log("You lost...");
	}
	setTimeout(()=>process.kill(process.pid),100);
});


let escapekeybuf="";

function kbdlistener(err,key){
	if(key=="")return;
	if(err){
		screen_end();
		console.log(err);
		sock.end();
		process.exit(1);
	}
	if(key=="\x1B")escapekeybuf+=key;
	else if(escapekeybuf.length>0){
		if(escapekeybuf=="\x1B"){
			if(key!="["){
				escapekeybuf="";
				bel();
			}
			escapekeybuf+="[";
		} else if(escapekeybuf=="\x1B["){
			switch(key){
				case "A": board_move(0); break;
				case "B": board_move(2); break;
				case "C": board_move(1); break;
				case "D": board_move(3); break;
				default:
					bel();
					break;
			}
			escapekeybuf="";
		} else {
			escapekeybuf="";
			bel();
		}
	} else switch(key){
		case "h": board_move(3); break;
		case "j": board_move(2); break;
		case "k": board_move(0); break;
		case "l": board_move(1); break;

		case "\n": case "\r": case " ":
			if(canclick&&!flags[size[0]*cursor[1]+cursor[0]]&&board[size[0]*cursor[1]+cursor[0]]=="9"){
				sock.write("click "+cursor[0]+" "+cursor[1]+"\n");
				changeds_reset();
				changeds[size[0]*cursor[1]+cursor[0]]=true;
				canclick=false;
				moveto(YOURTURNX,0);
				write("            ");
			} else {
				bel();
			}
			break;

		case "q":
			sock.end();
			screen_end();
			process.exit();
			return; //don't re-attach kbdlistener

		case "f":
			if(board[size[0]*cursor[1]+cursor[0]]!="9")bel();
			else {
				flags[size[0]*cursor[1]+cursor[0]]=!flags[size[0]*cursor[1]+cursor[0]];
				board_draw();
			}
			break;
	}
	kbd.getKey(kbdlistener);
}

kbd.getKey(kbdlistener);
