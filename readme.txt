Readme for Arena, the multiplayer asteroid game!

Arena runs on nodejs, express and socket.io. Box2D and easeljs are used for game logic and display objects.

In order to launch the application, open a command prompt in the Arena folder, type "nodemon" and press enter.

Open an instance of localhost:8000 in a web browser. Type a nickname into the text box and you will be registered.

The box at the bottom of the screen can be used to chat to other users. Four users are required to launch the game.

When four users have registered and clicked the "Start game" button, the game will commence. The goal is to destroy asteroids
in order to earn points. This is a co-op game, so all players contribute to a total score.

Controls:
Movement: WASD or arrow keys
Shoot: Spacebar

Each player controls a ship. Players can shoot lasers that damage or destroy asteroids, dependent on their size. Larger asteroids have higher hitpoints.

Colliding with an asteroid will destroy the player's ship. Once all four ships are destroyed, the game ends.