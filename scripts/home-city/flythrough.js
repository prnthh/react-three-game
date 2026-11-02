// Runtime update body. The generator embeds this source in the scene JSON.
// data is instance-local; delta is elapsed seconds. Scripts run only in Play.
if (object) object.position.z -= data.speed * delta;
