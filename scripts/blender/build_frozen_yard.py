"""Build the Frozen Yard demo in Blender; export visible scenery and a separate navmesh.
Run through Blender MCP: exec(compile(open(path).read(), path, 'exec')).
All coordinates below are Blender Z-up. The exported files use glTF Y-up.
"""
import bpy, math, random, json
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path('/Users/prnth/Documents/GitHub/react-three-game')
OUT = ROOT / 'docs/public/models/frozen-yard'
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(71)
scene = bpy.data.scenes.get('Frozen Yard')
if scene is None:
    scene = bpy.data.scenes.new('Frozen Yard')
else:
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.context.window.scene = scene
visual = bpy.data.collections.new('Frozen Yard • scenery')
scene.collection.children.link(visual)
nav_collection = bpy.data.collections.new('Frozen Yard • navigation')
scene.collection.children.link(nav_collection)

# Image textures survive GLB export, unlike Blender-only procedural shader nodes.
def noise(n, cells, seed):
    r = np.random.default_rng(seed).random((cells+1, cells+1)).astype(np.float32)
    p = np.linspace(0, cells, n, endpoint=False)
    i = p.astype(int); f = p-i; f = f*f*(3-2*f)
    return (r[i[:,None],i[None,:]]*(1-f[:,None])*(1-f[None,:]) +
            r[i[:,None]+1,i[None,:]]*f[:,None]*(1-f[None,:]) +
            r[i[:,None],i[None,:]+1]*(1-f[:,None])*f[None,:] +
            r[i[:,None]+1,i[None,:]+1]*f[:,None]*f[None,:])
def image_material(name, pixels, metallic=0.0, roughness=.9):
    n = pixels.shape[0]
    image = bpy.data.images.new(name, width=n, height=n)
    rgba = np.ones((n,n,4), dtype=np.float32); rgba[:,:,:3] = np.clip(pixels,0,1)
    image.pixels.foreach_set(rgba.ravel()); image.update()
    image.filepath_raw = str(OUT / (name+'.png')); image.file_format='PNG'; image.save(); image.pack()
    m = bpy.data.materials.new(name); m.use_nodes=True
    p = m.node_tree.nodes.get('Principled BSDF'); p.inputs['Metallic'].default_value=metallic; p.inputs['Roughness'].default_value=roughness
    tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image
    m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
    return m

def material(name, color, metallic=0, roughness=.9):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metallic
    return m

steel=[]
for k in range(4):
    n=512; broad=noise(n,8,k+31); grain=noise(n,130,k+32); flakes=noise(n,37,k+33)
    mask=np.clip((broad*.7+flakes*.3-.49)*13,0,1)
    base=np.array([.29,.31,.32])*(.73+.48*grain[:,:,None])
    rust=np.array([.31,.225,.17])*(.65+.65*flakes[:,:,None])
    rgb=base*(1-mask[:,:,None])+rust*mask[:,:,None]
    for _ in range(95):
        x=rng.randrange(n); y=rng.randrange(n); length=rng.randrange(4,95)
        rgb[y:min(n,y+length),x:x+1]*=.57
    steel.append(image_material('oxidized-steel-'+str(k),rgb,.18,.87))
# Weathered pavement: multi-scale ice, grit and snow accumulated near obstacles.
n=2048; yy,xx=np.mgrid[0:n,0:n]; X=xx/n*44-22; Y=yy/n*38-18
fine=noise(n,380,84); broad=noise(n,23,85); medium=noise(n,90,86)
base=np.array([.245,.258,.28])*(.7+.37*medium[:,:,None]+.23*fine[:,:,None])
edge=np.exp(-((Y-9.8)/1.45)**2)*.6 + np.exp(-((X-8)/2.4)**2-((Y-3)/6)**2)*.26
ring=np.sqrt((X+4)**2+Y**2)
edge+=np.exp(-((ring-4.4)/.85)**2)*.48
snow=np.clip((broad*.45+medium*.30+fine*.20+edge-.62)*24,0,1)
color=base*(1-snow[:,:,None])+np.array([.71,.72,.74])*(.90+.12*fine[:,:,None])*snow[:,:,None]
# Pavement plate joints and scattered rust freckles.
joints=(np.minimum(np.mod(X+22,2.8),2.8-np.mod(X+22,2.8))<.018)|(np.minimum(np.mod(Y+18,2.8),2.8-np.mod(Y+18,2.8))<.018)
color[joints & (snow<.5)]*=.62
floor_mat=image_material('frozen-pavement',color, .10,.95)
concrete=image_material('weathered-concrete',np.array([.40,.395,.38])*(.70+.50*noise(512,64,221)[:,:,None]),0,.95); snowmat=material('snow-crust',(.73,.74,.76))
dark=material('blackened-iron',(.058,.064,.067),.68,.75)
edge_metal=material('worn-bronze-edges',(.26,.22,.16),.65,.65)
face_mat=steel[2]; enamel_grain=noise(512,110,213); enamel_flakes=np.clip((noise(512,23,214)-.59)*10,0,1)
enamel=np.array([.62,.61,.55])*(.82+.24*enamel_grain[:,:,None])
enamel=enamel*(1-enamel_flakes[:,:,None])+np.array([.29,.23,.18])*enamel_flakes[:,:,None]
pale=image_material('worn-ivory-enamel',enamel,.18,.78)
flagmat=material('faded-oxblood-cloth',(.25,.075,.052),0,1)
paint=material('chalk-emblem',(.66,.63,.55),0,1)

# Helpers link into the new scene only; the user's original scene remains intact.
def adopt(obj,name,mat=None):
    obj.name=name
    for c in list(obj.users_collection): c.objects.unlink(obj)
    visual.objects.link(obj)
    if mat: obj.data.materials.append(mat)
    return obj

def box(name,loc,scale,mat=dark,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    obj=adopt(bpy.context.object,name,mat); obj.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=obj.modifiers.new('worn edges','BEVEL');mod.width=bevel;mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def cyl(name,loc,radius,depth,mat=dark,vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    return adopt(bpy.context.object,name,mat)

def sphere(name,loc,scale,mat,segments=16,rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=loc)
    obj=adopt(bpy.context.object,name,mat);obj.scale=scale
    return obj

def mesh(name,vertices,faces,mat):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);visual.objects.link(obj);data.materials.append(mat)
    uv=data.uv_layers.new(name='UVMap')
    for poly in data.polygons:
        for li in poly.loop_indices:
            v=data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv=(v.x*.37+v.y*.19,v.z*.41+v.y*.31)
    return obj

def beam(name,a,b,r=.045,mat=dark):
    a,b=Vector(a),Vector(b);o=cyl(name,(a+b)/2,r,(b-a).length,mat,8)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def cable(name,points,r=.045,mat=dark):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=2;data.bevel_depth=r;data.bevel_resolution=1
    sp=data.splines.new('POLY');sp.points.add(len(points)-1)
    for p,co in zip(sp.points,points):p.co=(*co,1)
    obj=bpy.data.objects.new(name,data);visual.objects.link(obj);obj.data.materials.append(mat)
    return obj

floor=mesh('paved-yard',[(-45,-40,0),(45,-40,0),(45,40,0),(-45,40,0)],[(0,1,2,3)],floor_mat)
for poly in floor.data.polygons:
    for li in poly.loop_indices:
        co=floor.data.vertices[floor.data.loops[li].vertex_index].co
        floor.data.uv_layers.active.data[li].uv=((co.x+22)/44,(co.y+18)/38)

# Circular plinth: stepped rings, individual coping blocks, frost on the edges.
for j in range(5):
    radius=4.5-j*.34;top=.16+j*.15
    cyl('monument-step',(-4,0,top/2),radius,top,concrete,96)
    for i in range(64):
        a=i*math.tau/64; b=(i+.93)*math.tau/64
        r0=radius-.13;r1=radius
        verts=[(-4+r*math.cos(t),r*math.sin(t),top+.008) for r,t in [(r0,a),(r1,a),(r1,b),(r0,b)]]
        mesh('frosted-step-rim',verts,[(0,1,2,3)],snowmat if rng.random()<.76 else steel[0])
# Blocky tapered armor pedestal.
for side in range(4):
    a=side*math.pi/2
    o=box('pedestal-armor',(-4+math.sin(a)*.9,math.cos(a)*.9,1.65),(1.9,.12,1.8),steel[side],.04)
    o.rotation_euler=(math.sin(a)*-.12,math.cos(a)*.12,-a)
box('pedestal-core',(-4,0,1.62),(1.65,1.65,1.8),dark)
for i in range(4):
    o=box('pedestal-rib',(-5.02+i*.68,-1.05,1.4),(.1,.18,1.45),edge_metal)
# Plaque on the front of the podium.
box('memorial-plaque',(-2.7,-1.65,1.05),(1.65,.19,.78),edge_metal,.025)
for j in range(7):
    for i in range(19):
        if rng.random()>.28:box('plaque-inscription',(-3.4+i*.075,-1.751,.79+j*.078),(.039,.012,.026),dark)

# Exposed neck: vertebrae, rods and hanging cable bundles.
for z in np.arange(2.5,4.6,.22):
    cyl('neck-vertebra',(-4,0,z),.29,.11,edge_metal,12)
for i in range(16):
    a=math.tau*i/16; rad=rng.uniform(.3,.65)
    pts=[]
    for j in range(9):
        t=j/8;rr=rad+math.sin(t*math.pi)*rng.uniform(.06,.18)
        pts.append((-4+math.cos(a)*rr,math.sin(a)*rr,2.4+t*2.35))
    cable('neck-cable',pts,rng.uniform(.026,.065),dark if i%3 else edge_metal)
for x in [-.55,.55]:beam('neck-piston',(-4+x,.16,2.5),(-4+x,-.12,4.6),.095,edge_metal)

# Faceted robotic head. Local face points toward -Y, rotated toward the open lane.
head=[]
def headpart(obj):head.append(obj);return obj
headpart(sphere('cranial-shell',(0,.06,5.65),(.83,.73,1.18),face_mat,20,12))
headpart(sphere('cranial-enamel',(0,.11,6.12),(.81,.72,.73),pale,16,8))
# Cheek, jaw and forehead plates preserve a humanoid profile at the game camera scale.
headpart(mesh('face-mask',[(-.64,-.52,6.1),(.64,-.52,6.1),(.68,-.68,5.55),(.42,-.69,4.85),(-.42,-.69,4.85),(-.68,-.68,5.55)],[(0,1,2,3,4,5)],pale))
for side in [-1,1]:
    headpart(box('eye-socket',(side*.35,-.725,5.84),(.46,.13,.20),dark,.04))
    headpart(box('eye-lens',(side*.35,-.801,5.84),(.30,.035,.055),edge_metal))
    brow=headpart(box('brow-plate',(side*.34,-.71,6.0),(.54,.20,.12),pale,.02));brow.rotation_euler[1]=side*.12
    headpart(mesh('cheek-plate',[(side*.61,-.73,5.7),(side*.25,-.82,5.57),(side*.34,-.85,5.23),(side*.57,-.65,5.18)],[(0,1,2,3)],face_mat))
    ear=headpart(cyl('auditory-ring',(side*.86,.05,5.68),.33,.19,edge_metal,24));ear.rotation_euler[1]=math.pi/2
    ear=headpart(cyl('auditory-inset',(side*.97,.05,5.68),.23,.035,dark,24));ear.rotation_euler[1]=math.pi/2
    ear=headpart(cyl('auditory-hub',(side*1.00,.05,5.68),.14,.045,steel[0],16));ear.rotation_euler[1]=math.pi/2
headpart(mesh('nose',[(-.13,-.71,5.93),(.13,-.71,5.93),(.18,-1.01,5.45),(-.18,-1.01,5.45),(-.11,-.71,5.36),(.11,-.71,5.36)],[(0,1,2,3),(3,2,5,4),(0,3,4),(1,5,2)],pale))
headpart(box('mouth-gap',(0,-.786,5.19),(.50,.07,.045),dark))
headpart(box('lower-lip',(0,-.80,5.12),(.46,.10,.07),pale,.025))
headpart(box('chin',(0,-.63,4.94),(.57,.35,.24),pale,.07))
for i in range(34):
    a=rng.uniform(0,math.tau);z=rng.uniform(5.95,6.55)
    headpart(sphere('cranial-fastener',(.73*math.cos(a),.06+.65*math.sin(a),z),(.045,.045,.025),edge_metal,8,4))
angle=math.radians(25)
for o in head:
    x,y,z=o.location;o.location=(-4+x*math.cos(angle)-y*math.sin(angle),x*math.sin(angle)+y*math.cos(angle),z)
    # Mesh vertices made in head-local coordinates need the same origin transform.
    if o.name.startswith(('face-mask','cheek-plate','nose')):o.location=(-4,0,0)
    o.rotation_euler[2]+=angle

# Rusty industrial sheds; thin overlapping panels and structural seams.
obstacles=[]
def shed(name,cx,cy,w,d,h):
    obstacles.append({'min':[cx-w/2-.5,cy-d/2-.5],'max':[cx+w/2+.5,cy+d/2+.5]})
    box(name+'-interior',(cx,cy,h/2),(w-.1,d-.1,h),dark)
    for side in [-1,1]:
        count=math.ceil(w/1.3)
        for row in range(2):
            for i in range(count):
                px=cx-w/2+(i+.5)*w/count
                box(name+'-wall-panel',(px,cy+side*d/2,h*(row+.5)/2),(w/count-.025,.065,h/2-.03),rng.choice(steel))
                for z in [row*h/2+.12,(row+1)*h/2-.12]:
                    for dx in [-w/count*.41,w/count*.41]:
                        bolt=cyl('wall-rivet',(px+dx,cy+side*(d/2+.045),z),.025,.035,edge_metal,6);bolt.rotation_euler[0]=math.pi/2
    for side in [-1,1]:
        for row in range(2):
            for i in range(math.ceil(d/1.3)):
                py=cy-d/2+(i+.5)*d/math.ceil(d/1.3)
                box(name+'-end-panel',(cx+side*w/2,py,h*(row+.5)/2),(.065,d/math.ceil(d/1.3)-.025,h/2-.03),rng.choice(steel))
    for x in [-w/2,w/2]:
        for y in [-d/2,d/2]:box(name+'-column',(cx+x,cy+y,h/2),(.13,.13,h+.25),dark)
    for j in range(math.ceil(d/1.4)):
        for i in range(math.ceil(w/1.5)):
            x=cx-w/2+(i+.5)*w/math.ceil(w/1.5);y=cy-d/2+(j+.5)*d/math.ceil(d/1.4)
            panel=box(name+'-roof',(x,y,h+.08),(w/math.ceil(w/1.5)+.13,d/math.ceil(d/1.4)+.10,.08),rng.choice(steel))
            panel.rotation_euler[0]=rng.uniform(-.035,.035)
            for dx in [-.48,.48]:cyl('roof-rivet',(x+dx,y-.3,h+.145),.035,.035,edge_metal,8)
    # Awning and shutter on the front.
    box(name+'-door',(cx-w*.18,cy-d/2-.06,1.2),(1.1,.07,2.35),dark)
    for j in range(13):box('shutter-slats',(cx-w*.18,cy-d/2-.11,.15+j*.17),(1.05,.04,.06),steel[0])
    roof=box(name+'-awning',(cx-w*.18,cy-d/2-.72,2.75),(2.1,1.6,.08),steel[1]);roof.rotation_euler[0]=.12
    for x in [-1,1]:
        box('awning-support',(cx-w*.18+x,cy-d/2-1.35,1.36),(.075,.075,2.72),dark)
        obstacles.append({'circle':[cx-w*.18+x,cy-d/2-1.35,.48]})

shed('east-workshop',9,3.4,9.2,4.1,3.65)
shed('rear-factory',-3.5,12.5,26,4.6,5.6)
shelter_before=set(visual.objects)
shed('foreground-shelter',10,-7.6,5.4,4,3.3)
for obj in set(visual.objects)-shelter_before:
    if not any(part in obj.name for part in ['-roof','-column','roof-rivet']):
        bpy.data.objects.remove(obj,do_unlink=True)
# High windows, missing panes and diagonal braces on the rear wall.
for i in range(14):
    x=-15.4+i*1.72
    box('factory-window',(x,10.13,4.15),(1.45,.08,1.05),dark)
    for dx in [-.72,0,.72]:box('window-mullion',(x+dx,10.04,4.15),(.055,.08,1.1),edge_metal)
    box('window-crossbar',(x,10.03,4.15),(1.5,.08,.045),edge_metal)
# Flags and architectural marking.
box('banner-mast',(-3.6,3.4,3.7),(.09,.09,7.4),dark)
verts=[]
for j in range(15):
    z=7.0-j*.35
    for i in range(5):verts.append((-3.45+i*.37,3.35+math.sin(j*.7+i)*.08,z+(rng.uniform(-.35,0) if j==14 else 0)))
faces=[(j*5+i,j*5+i+1,(j+1)*5+i+1,(j+1)*5+i) for j in range(14) for i in range(4)]
mesh('tattered-banner',verts,faces,flagmat)
# Circle emblem made of separate painted arc strips on the banner surface.
for i in range(40):
    a=i*math.tau/40;b=(i+.8)*math.tau/40
    v=[(-2.71+r*math.cos(t),3.22,5.72+r*math.sin(t)) for r,t in [(.42,a),(.57,a),(.57,b),(.42,b)]]
    mesh('banner-ring-emblem',v,[(0,1,2,3)],paint)
for j in range(2):
    # Two chevrons painted on the workshop end.
    x=11+(j-.5)*.55;y=1.30
    for sign in [-1,1]:
        o=box('workshop-chevron',(x+sign*.22,y,2.50),(.11,.015,.9),paint);o.rotation_euler[1]=sign*.55

# Bollards, crates, loose panels, grates, pipes, debris and frost piles.
for x,y in [(-8,-3.6),(-1,-4.9),(.6,2.3),(-8.2,3.5)]:
    cyl('bollard',(x,y,.65),.13,1.3,concrete,8);cyl('bollard-cap',(x,y,1.32),.15,.06,snowmat,8)
    obstacles.append({'circle':[x,y,.45]})
for x,y in [(4.6,-.9),(5,8),(-10,7),(11,-4.5)]:
    box('supply-crate',(x,y,.45),(.9,.8,.9),steel[1],.03)
    for z in [.12,.72]:box('crate-band',(x,y-.405,z),(.94,.035,.055),dark)
    obstacles.append({'min':[x-.75,y-.7],'max':[x+.75,y+.7]})
for i in range(50):
    x=rng.uniform(-16,14);y=rng.choice([rng.uniform(8.7,9.7),rng.uniform(-8.2,-7.5)])
    o=box('scrap',(x,y,.05),(rng.uniform(.1,.5),rng.uniform(.06,.2),.035),rng.choice(steel));o.rotation_euler[2]=rng.uniform(0,math.pi)
for i in range(30):
    x=rng.uniform(-17,15);y=rng.uniform(-12,10)
    if rng.random()<.6:y=rng.choice([rng.uniform(8.4,10),rng.uniform(-1.7,-1.2)])
    radius=rng.uniform(.08,.5)
    verts=[(x,y,.015)]+[(x+math.cos(a)*radius*rng.uniform(.6,1.2),y+math.sin(a)*radius*rng.uniform(.5,1.3),.018) for a in np.linspace(0,math.tau,9,endpoint=False)]
    mesh('windblown-snow',verts,[(0,j+1,(j+1)%9+1) for j in range(9)],snowmat)
# Foreground framing silhouette on the left, matching the reference's industrial cut-in.
for x,y in [(-16,-8),(-12,-10)]:
    box('foreground-upright',(x,y,2.2),(.18,.18,4.4),dark)
beam('foreground-crossbar',(-16,-8,3.7),(-12,-10,3.7),.10,dark)
beam('foreground-diagonal',(-16,-8,.2),(-12,-10,3.7),.085,dark)

# Author a genuinely separate walkable surface with obstacle clearance baked in.
# Every included square has all corners clear; triangles share vertices for adjacency.
vertices=[];faces=[];indices={};step=.5

def blocked(x,y):
    if (x+4)**2+y*y < 5.0**2:return True
    for ob in obstacles:
        if 'circle' in ob:
            a,b,r=ob['circle']
            if (x-a)**2+(y-b)**2<r*r:return True
        elif ob['min'][0]<=x<=ob['max'][0] and ob['min'][1]<=y<=ob['max'][1]:return True
    # Awning legs and the foreground frame are also excluded.
    if 6.1<x<8.6 and -.4<y<1.5:return True
    if y < -7.8 and x < -11:return True
    return False

def vertex(x,y):
    key=(x,y)
    if key not in indices:indices[key]=len(vertices);vertices.append((x,y,.025))
    return indices[key]
for ix in range(62):
    for iy in range(46):
        x=-16+ix*step;y=-13+iy*step
        if any(blocked(x+dx,y+dy) for dx,dy in [(0,0),(step,0),(step,step),(0,step),(.25,.25)]):continue
        a,b,c,d=[vertex(x+dx,y+dy) for dx,dy in [(0,0),(step,0),(step,step),(0,step)]]
        faces.extend([(a,b,c),(a,c,d)])
nav=mesh('WalkableSurface',vertices,faces,material('navmesh-debug',(.05,.6,.75)))
visual.objects.unlink(nav);nav_collection.objects.link(nav)
nav.hide_render=True;nav.display_type='WIRE';nav['purpose']='Navigation only; excluded from the visible scenery export'
navdata={'vertices':[[round(x,4),round(z,4),round(-y,4)] for x,y,z in vertices],'triangles':[list(f) for f in faces],'clearance':.5,'source':'WalkableSurface in frozen-yard.blend'}
(OUT/'navmesh.json').write_text(json.dumps(navdata,separators=(',',':')))

# Fixed orthographic composition.
camdata=bpy.data.cameras.new('Reference orthographic camera');cam=bpy.data.objects.new('Reference camera',camdata);scene.collection.objects.link(cam)
cam.location=(-19,-27,24);target=Vector((1.8,.2,-1.0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=26
scene.camera=cam
sun_data=bpy.data.lights.new('Cold winter sun','SUN');sun_data.energy=2.3;sun_data.angle=.065
sun=bpy.data.objects.new('Cold winter sun',sun_data);scene.collection.objects.link(sun);sun.rotation_euler=(math.radians(28),math.radians(-22),math.radians(-35))
world=bpy.data.worlds.new('Overcast blue grey');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.36,.40,.49,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1440;scene.render.resolution_y=810;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
# Convert curves, then merge by material to keep runtime draw calls bounded.
bpy.ops.object.select_all(action='DESELECT')
for obj in list(visual.objects):
    if obj.type=='CURVE':
        obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');obj.select_set(False)
for mat in list(bpy.data.materials):
    group=[o for o in visual.objects if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
    if len(group)<2:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in group:o.select_set(True)
    bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();group[0].name='Scenery • '+mat.name
bpy.ops.object.select_all(action='DESELECT')
for obj in visual.objects:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'scene.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_apply=True,export_image_format='JPEG',export_jpeg_quality=88)
bpy.ops.object.select_all(action='DESELECT');nav.hide_render=False;nav.select_set(True);bpy.context.view_layer.objects.active=nav
bpy.ops.export_scene.gltf(filepath=str(OUT/'navmesh.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False)
nav.hide_render=True;nav.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'frozen-yard.blend'))
scene.render.filepath=str(OUT/'preview.png')
# Web camera uses the exact Blender position, target and orthographic scale.
(OUT/'composition.json').write_text(json.dumps({'position':[-19,24,27],'target':[1.8,-1.0,-.2],'width':26,'aspect':16/9},indent=2))
result={'scene':scene.name,'objects':len(visual.objects),'triangles':sum(len(o.data.polygons) for o in visual.objects if o.type=='MESH'),'navTriangles':len(faces),'files':[str(OUT/'scene.glb'),str(OUT/'navmesh.json'),str(OUT/'frozen-yard.blend')]}
