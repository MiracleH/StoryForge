import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Typography, Select, Empty, Spin, Tag, Space, message, Input, Slider, Form, Drawer, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, LeftOutlined, RightOutlined, EditOutlined, RocketOutlined, SoundOutlined } from '@ant-design/icons';
import { useStoryboardStore, useAIStore } from '../../stores';
import { useProjectSelector, useChapterSceneSelector } from '../../hooks';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const cameraAngles = ['wide', 'medium', 'close', 'extreme_close', 'high', 'low', 'dutch'];
const cameraMovements = ['static', 'pan', 'tilt', 'zoom_in', 'zoom_out', 'dolly', 'crane', 'tracking'];
const transitionTypes = ['cut', 'fade', 'dissolve', 'wipeleft', 'wiperight', 'slideup', 'slidedown'];
const angleLabels: Record<string, string> = { wide: '远景', medium: '中景', close: '近景', extreme_close: '特写', high: '俯拍', low: '仰拍', dutch: '倾斜' };
const moveLabels: Record<string, string> = { static: '固定', pan: '横摇', tilt: '俯仰', zoom_in: '推', zoom_out: '拉', dolly: '推拉', crane: '升降', tracking: '跟拍' };
const transitionLabels: Record<string, string> = { cut: '硬切', fade: '淡入淡出', dissolve: '溶解', wipeleft: '左擦', wiperight: '右擦', slideup: '上推', slidedown: '下推' };

const StoryboardEditor: React.FC = () => {
  const { projects, selectedProjectId, setSelectedProjectId } = useProjectSelector();
  const { chapters, chapterScenes, selectedChapterId, setSelectedChapterId, selectedSceneId, setSelectedSceneId } = useChapterSceneSelector(selectedProjectId);
  const { storyboards, currentStoryboard, currentIdx, loading, fetchStoryboards, createStoryboard, updateStoryboard, deleteStoryboard, reorderStoryboards, addDialogue, deleteDialogue, setCurrentIdx } = useStoryboardStore();
  const { generating, generateStoryboardImage, generateTTS } = useAIStore();

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [dialogueForm] = Form.useForm();
  const [addDialogueVisible, setAddDialogueVisible] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedSceneId) return;
    fetchStoryboards(selectedSceneId);
  }, [selectedSceneId]);

  const current = currentStoryboard;

  const handleSaveStoryboard = async () => {
    if (!current) return;
    try {
      const values = editForm.getFieldsValue();
      await updateStoryboard(current.id, values);
      message.success('保存成功');
      setEditDrawerOpen(false);
    } catch { message.error('保存失败'); }
  };

  const handleAddStoryboard = async () => {
    if (!selectedSceneId) return;
    try {
      await createStoryboard({
        scene_id: selectedSceneId,
        title: `分镜 ${storyboards.length + 1}`,
        description: '',
        duration: 5,
        camera_angle: 'medium',
        order_index: storyboards.length,
        transition_type: 'cut',
        transition_duration: 0.5,
      });
      message.success('添加成功');
    } catch { message.error('添加失败'); }
  };

  const handleDeleteStoryboard = async () => {
    if (!current) return;
    try {
      await deleteStoryboard(current.id);
      message.success('删除成功');
    } catch { message.error('删除失败'); }
  };

  const handleAddDialogue = async () => {
    if (!current) return;
    try {
      const values = await dialogueForm.validateFields();
      await addDialogue(current.id, {
        content: values.content,
        style: values.style || 'speech',
        position_x: values.position_x ?? 50,
        position_y: values.position_y ?? 85,
        order_index: (current.dialogues?.length || 0),
      });
      dialogueForm.resetFields();
      setAddDialogueVisible(false);
      message.success('添加成功');
    } catch { message.error('添加失败'); }
  };

  const handleDeleteDialogue = async (dialogueId: number) => {
    try {
      await deleteDialogue(dialogueId);
      message.success('删除成功');
    } catch { message.error('删除失败'); }
  };

  const handleGenerateStoryboardImage = async () => {
    if (!current) return;
    try {
      await generateStoryboardImage(current.id);
      message.success('分镜图片生成成功');
      fetchStoryboards(selectedSceneId!);
    } catch { message.error('生成失败'); }
  };

  const handleGenerateTTS = async (dialogueId: number) => {
    try {
      const audioPath = await generateTTS(dialogueId);
      message.success('语音生成成功');
      const audio = new Audio(audioPath);
      audio.play();
    } catch { message.error('生成失败'); }
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = async (idx: number) => {
    if (dragIdx === null || dragIdx === idx) return;
    const newList = [...storyboards];
    const [moved] = newList.splice(dragIdx, 1);
    newList.splice(idx, 0, moved);
    setCurrentIdx(idx);
    setDragIdx(null);
    try {
      await reorderStoryboards(selectedSceneId!, newList.map(s => s.id));
    } catch { message.error('排序保存失败'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Space>
          <Title level={2} style={{ margin: 0 }}>分镜编辑</Title>
          <Select placeholder="项目" style={{ width: 150 }} value={selectedProjectId} onChange={setSelectedProjectId}>
            {projects.map(p => <Option key={p.id} value={p.id}>{p.title}</Option>)}
          </Select>
          <Select placeholder="章节" style={{ width: 150 }} value={selectedChapterId} onChange={setSelectedChapterId} disabled={!chapters.length}>
            {chapters.map(c => <Option key={c.id} value={c.id}>{c.title}</Option>)}
          </Select>
          <Select placeholder="场景" style={{ width: 150 }} value={selectedSceneId} onChange={setSelectedSceneId} disabled={!chapterScenes.length}>
            {chapterScenes.map((s: any) => <Option key={s.id} value={s.id}>{s.title}</Option>)}
          </Select>
        </Space>
        <Space>
          <Button icon={<PlusOutlined />} onClick={handleAddStoryboard} disabled={!selectedSceneId}>添加分镜</Button>
        </Space>
      </div>

      {!selectedSceneId ? <Empty description="请先选择场景" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} /> :
       loading ? <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spin size="large" /></div> :
       storyboards.length === 0 ? <Empty description="暂无分镜，点击上方添加" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} /> :
       <>
         {(() => {
           const currentScene = chapterScenes.find((s: any) => s.id === selectedSceneId);
           return currentScene ? (
             <div style={{ padding: '8px 12px', background: '#f6f8fa', borderRadius: 8, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
               <Tag color="blue">场景</Tag>
               <Text strong>{currentScene.title}</Text>
               {currentScene.description && <Text type="secondary" ellipsis style={{ flex: 1 }}>{currentScene.description}</Text>}
             </div>
           ) : null;
         })()}

         <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0 }}>
           <Card style={{ flex: 1 }} bodyStyle={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
               <Space>
                 <Button icon={<LeftOutlined />} disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)} />
                 <Text strong>{currentIdx + 1} / {storyboards.length}</Text>
                 <Button icon={<RightOutlined />} disabled={currentIdx === storyboards.length - 1} onClick={() => setCurrentIdx(currentIdx + 1)} />
               </Space>
               <Space>
                 <Button icon={<RocketOutlined />} loading={generating[`storyboard-${current?.id}`]} onClick={handleGenerateStoryboardImage} disabled={!current}>AI生成图片</Button>
                 <Button icon={<EditOutlined />} onClick={() => { if (current) { editForm.setFieldsValue(current); setEditDrawerOpen(true); } }}>编辑属性</Button>
                 <Popconfirm title="确定删除？" onConfirm={handleDeleteStoryboard}>
                   <Button danger icon={<DeleteOutlined />} />
                 </Popconfirm>
               </Space>
             </div>

             <div style={{ flex: 1, background: '#1a1a2e', borderRadius: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 24, position: 'relative', minHeight: 300 }}>
               {current?.image_url ? (
                 <img src={current.image_url} alt={current.title} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 4 }} />
               ) : (
                 <div style={{ textAlign: 'center', color: '#fff' }}>
                   <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
                   <Title level={3} style={{ color: '#fff' }}>{current?.title}</Title>
                   <Paragraph style={{ color: '#aaa', maxWidth: 400 }}>{current?.description}</Paragraph>
                 </div>
               )}

               <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 4 }}>
                 <Tag color="blue">{angleLabels[current?.camera_angle || ''] || current?.camera_angle}</Tag>
                 {current?.camera_movement && <Tag color="green">{moveLabels[current.camera_movement] || current.camera_movement}</Tag>}
                 <Tag color="orange">{current?.duration}s</Tag>
               </div>

               {current?.dialogues && current.dialogues.length > 0 && (
                 <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
                   {current.dialogues.map((d: any, i: number) => (
                     <div key={i} style={{ background: 'rgba(255,255,255,0.9)', padding: '8px 12px', borderRadius: 8, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <Text>💬 {d.content}</Text>
                       <Space size={4}>
                         {d.audio_path && <audio src={d.audio_path} controls style={{ height: 28, maxWidth: 120 }} />}
                         <Button type="text" size="small" icon={<SoundOutlined />} loading={generating[`tts-${d.id}`]} onClick={() => handleGenerateTTS(d.id)} title="AI配音" />
                         <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteDialogue(d.id)} />
                       </Space>
                     </div>
                   ))}
                 </div>
               )}
             </div>

             <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
               <Button icon={<PlusOutlined />} onClick={() => setAddDialogueVisible(true)}>添加对话</Button>
             </div>
           </Card>
         </div>

         <div ref={timelineRef} style={{ marginTop: 12, padding: '12px 0', overflowX: 'auto', display: 'flex', gap: 8 }}>
           {storyboards.map((sb, idx) => (
             <div
               key={sb.id}
               draggable
               onDragStart={() => handleDragStart(idx)}
               onDragOver={handleDragOver}
               onDrop={() => handleDrop(idx)}
               onClick={() => setCurrentIdx(idx)}
               style={{
                 minWidth: 120, height: 80, borderRadius: 8, cursor: 'pointer',
                 border: idx === currentIdx ? '2px solid #1890ff' : '2px solid #d9d9d9',
                 background: idx === currentIdx ? '#e6f7ff' : '#fafafa',
                 display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                 padding: 8, transition: 'all 0.2s',
                 opacity: dragIdx === idx ? 0.5 : 1,
               }}
             >
               <Tag color="blue" style={{ margin: '0 0 4px' }}>{idx + 1}</Tag>
               <Text ellipsis style={{ fontSize: 11, maxWidth: 100 }}>{sb.title}</Text>
               <Text type="secondary" style={{ fontSize: 10 }}>{angleLabels[sb.camera_angle] || sb.camera_angle} · {sb.duration}s</Text>
             </div>
           ))}
         </div>
       </>
      }

      <Drawer title="编辑分镜属性" open={editDrawerOpen} onClose={() => setEditDrawerOpen(false)} width={400} extra={<Button type="primary" icon={<SaveOutlined />} onClick={handleSaveStoryboard}>保存</Button>}>
        <Form form={editForm} layout="vertical">
          <Form.Item name="title" label="标题"><Input /></Form.Item>
          <Form.Item name="description" label="描述"><TextArea rows={3} /></Form.Item>
          <Form.Item name="image_url" label="图片URL"><Input /></Form.Item>
          <Form.Item name="duration" label="时长(秒)"><Slider min={1} max={30} /></Form.Item>
          <Form.Item name="camera_angle" label="景别">
            <Select>{cameraAngles.map(a => <Option key={a} value={a}>{angleLabels[a]}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="camera_movement" label="运镜">
            <Select>{cameraMovements.map(m => <Option key={m} value={m}>{moveLabels[m]}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="transition_type" label="转场效果">
            <Select>{transitionTypes.map(t => <Option key={t} value={t}>{transitionLabels[t]}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="transition_duration" label="转场时长(秒)">
            <Slider min={0} max={2} step={0.1} />
          </Form.Item>
        </Form>
      </Drawer>

      {addDialogueVisible && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={() => setAddDialogueVisible(false)}>
          <Card title="添加对话" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <Form form={dialogueForm} layout="vertical">
              <Form.Item name="content" label="对话内容" rules={[{ required: true, message: '请输入对话' }]}>
                <TextArea rows={3} placeholder="请输入对话内容" />
              </Form.Item>
              <Form.Item name="style" label="样式" initialValue="speech">
                <Select>
                  <Option value="speech">普通</Option>
                  <Option value="shout">喊叫</Option>
                  <Option value="whisper">低语</Option>
                </Select>
              </Form.Item>
              <Form.Item name="position_x" label="水平位置 (%)" initialValue={50}>
                <Slider min={0} max={100} />
              </Form.Item>
              <Form.Item name="position_y" label="垂直位置 (%)" initialValue={85}>
                <Slider min={0} max={100} />
              </Form.Item>
            </Form>
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setAddDialogueVisible(false)}>取消</Button>
                <Button type="primary" onClick={handleAddDialogue}>添加</Button>
              </Space>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default StoryboardEditor;
