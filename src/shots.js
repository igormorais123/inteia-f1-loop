// Scroll-addressable dolly: every pose is repeatable, with zero displacement
// and zero derivative at chapter boundaries. Mechanics remain story-owned.
export function photograph(pose) {
 const local=Math.max(0,Math.min(1,pose.local||0));
 const arc=Math.sin(Math.PI*local)**2;
 const directions=[1,-1,1,-1,1,0];
 const angle=arc*.21*directions[pose.index];
 const [x,y,z]=pose.camera, [tx,ty,tz]=pose.target;
 // Inspection chapters keep clearance for the exploded assembly; the intact
 // car permits a measured push-in, never a crop-dependent hero close-up.
 const approach=1-arc*[.07,.025,.075,.065,.025,0][pose.index];
 const dx=(x-tx)*approach,dz=(z-tz)*approach;
 return {...pose,camera:[tx+dx*Math.cos(angle)-dz*Math.sin(angle),ty+(y-ty)*approach+arc*.18,tz+dx*Math.sin(angle)+dz*Math.cos(angle)],target:[tx,ty+arc*.05,tz]};
}
