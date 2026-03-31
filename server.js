import express from 'express'
import {Server} from 'socket.io'
import http from 'http'
import cors from 'cors'

const app=express();

const PORT = process.env.PORT || 5000

app.use(cors({
    origin:["http://localhost:3000"],
    credentials : true
}));

// app.use(express.json());



const httpServer = http.createServer(app);
// io=socket.io(httpServer);

const io = new Server(httpServer , {
    cors: {
        origin:["http://localhost:3000"],
        credentials:true
    }
});

let waitingPlayer=null;
const games={};

io.on("connection" , socket => {
    console.log("A User Connected: " , socket.id);

    socket.on("game:join" , () => {
        if(waitingPlayer){
            const roomId = waitingPlayer.id+"#AG#"+socket.id;
            console.log(`PLayer ${waitingPlayer.id} and ${socket.id} have got the room ${roomId}`);

            socket.join(roomId);
            waitingPlayer.join(roomId);

            const players = {
                X:waitingPlayer.id,
                O:socket.id
            }

            games[roomId] = {
                board:Array(9).fill(""),
                turn:'X',
                players,
                rematchRequests: new Set()
            };
            
            io.to(roomId).emit("game:start" , {
                roomId,
                players,
                turn:"X",
                board:games[roomId].board
            })

            waitingPlayer=null;
        }
        else{
            waitingPlayer=socket;
            socket.emit("game:waiting");
            console.log(`Player ${waitingPlayer.id} is searching for a room`);
        }
    });

    socket.on("game:move" , (data) => {
        const {roomId , cell} = data;
        const game=games[roomId];

        const player = game.players.X===socket.id ? 'X':'O';
        if(game.turn  !== player) return;
        if(game.board[cell] !== "") return;
        
        game.board[cell]=player;

        const winner = checkWinner(game.board);
        const isDraw = !winner && game.board.every(c => c!=="");
        if(winner===player || isDraw){
            io.to(roomId).emit("game:over" , {
                winner:winner || "draw" ,
                board:game.board
            });
            // delete games[roomId];
            // return;
        }

        game.turn= player==='X' ? 'O':'X';

        io.to(roomId).emit("game:update" , {
            board:game.board,
            turn:game.turn
        });
    });   
    
    socket.on("game:rematchRequest" , (data) => {
        const game =games[data.roomId];
        if(!game) return;

        game.rematchRequests.add(socket.id);
        if(game.rematchRequests.size === 2){
            game.board = Array(9).fill("");
            game.turn = "X";
            game.rematchRequests.clear();
            io.to(data.roomId).emit("game:start", { 
                roomId: data.roomId, 
                players: game.players, 
                turn:game.turn, 
                board:game.board 
            });
        } 
        else{
            socket.to(data.roomId).emit("game:rematchInvited",data);
        }
    });

    socket.on("game:leave" , (data) => {
        const {roomId} = data;
        if(!roomId) return;
        
        if(games[roomId]){
            socket.to(roomId).emit("game:opponentLeft");
            delete games[roomId];
            console.log(`Game ${roomId} ended because ${socket.id} left for lobby`);
        }
    });

    socket.on("disconnect" , () => {
        if(waitingPlayer===socket){
            waitingPlayer=null;
        }
        console.log(`User : ${socket.id} disconnected`);
    })
})

function checkWinner(board) {
    const wins = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
    ];

    for(let [a,b,c] of wins){
        if(board[a] && board[a] === board[b] && board[b] === board[c]){
            return board[a];
        }
    }
    return null;
}

httpServer.listen(PORT, () => console.log(`Backend Server running on PORT ${PORT}`));