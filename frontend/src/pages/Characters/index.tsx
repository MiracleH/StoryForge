import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, message, Popconfirm, Modal, Form, Input, Select, Empty, Drawer, Tabs, List, Image } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SmileOutlined, ThunderboltOutlined, RocketOutlined } from '@ant-design/icons';
import { useCharacterStore, useAIStore } from '../../stores';
import { useProjectSelector } from '../../hooks';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const emotionColors: Record<string, string> = {
  happy: '#52c41a', sad: '#1890ff', angry: '#f5222d', surprised: '#faad14',
  fear: '#722ed1', neutral: '#d9d9d9',
};

const Characters: React.FC = () => {
  const { characters, expressions, actions, loading, fetchCharacters, createCharacter, updateCharacter, deleteCharacter, fetchExpressions, addExpression, deleteExpression, fetchActions, addAction, deleteAction } = useCharacterStore();
  const { generating, generateCharacterImage, generateExpressionImage } = useAIStore();
  const { projects, selectedProjectId, setSelectedProjectId } = useProjectSelector();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<any>(null);
  const [form] = Form.useForm();

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCharId, setSelectedCharId] = useState<number | null>(null);
  const [exprModalOpen, setExprModalOpen] = useState(false);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [exprForm] = Form.useForm();
  const [actionForm] = Form.useForm();

  useEffect(() => { if (selectedProjectId) fetchCharacters(selectedProjectId); }, [selectedProjectId]);

  const handleAdd = () => { setEditingCharacter(null); form.resetFields(); setModalVisible(true); };
  const handleEdit = (record: any) => { setEditingCharacter(record); form.setFieldsValue(record); setModalVisible(true); };
  const handleDelete = async (id: number) => {
    try { await deleteCharacter(id); message.success('删除成功'); } catch { message.error('删除失败'); }
  };
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingCharacter) { await updateCharacter(editingCharacter.id, values); message.success('更新成功'); }
      else { await createCharacter({ ...values, project_id: selectedProjectId }); message.success('创建成功'); }
      setModalVisible(false);
    } catch { message.error('操作失败'); }
  };

  const openDrawer = async (charId: number) => {
    setSelectedCharId(charId);
    setDrawerOpen(true);
    fetchExpressions(charId);
    fetchActions(charId);
  };

  const handleAddExpression = async () => {
    if (!selectedCharId) return;
    try { await addExpression(selectedCharId, await exprForm.validateFields()); message.success('添加成功'); setExprModalOpen(false); exprForm.resetFields(); }
    catch { message.error('添加失败'); }
  };

  const handleAddAction = async () => {
    if (!selectedCharId) return;
    try { await addAction(selectedCharId, await actionForm.validateFields()); message.success('添加成功'); setActionModalOpen(false); actionForm.resetFields(); }
    catch { message.error('添加失败'); }
  };

  const handleGenerateCharacterImage = async (characterId: number) => {
    try { await generateCharacterImage(characterId); message.success('角色外观生成成功'); fetchCharacters(selectedProjectId!); } catch { message.error('生成失败'); }
  };

  const handleGenerateExpressionImage = async (expressionId: number, characterId: number) => {
    try { await generateExpressionImage(expressionId, characterId); message.success('表情图片生成成功'); fetchExpressions(characterId); } catch { message.error('生成失败'); }
  };

  const columns = [
    { title: '头像', dataIndex: 'avatar', key: 'avatar', width: 60, render: (url: string) => url ? <Image src={url} width={40} height={40} style={{ borderRadius: 4, objectFit: 'cover' }} /> : '-' },
    { title: '角色名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '性格', dataIndex: 'personality', key: 'personality', ellipsis: true },
    { title: '风格', dataIndex: 'style', key: 'style', render: (s: string) => <Tag>{{ anime: '日系动漫', manga: '漫画', realistic: '写实', cartoon: '卡通' }[s] || s}</Tag> },
    {
      title: '操作', key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" icon={<SmileOutlined />} onClick={() => openDrawer(record.id)}>表情/动作</Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}><Button type="link" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
        </Space>
      ),
    },
  ];

  if (!selectedProjectId && projects.length === 0) return <div><Title level={2}>角色管理</Title><Card><Empty description="请先创建项目" /></Card></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Title level={2} style={{ margin: 0 }}>角色管理</Title>
          <Select placeholder="选择项目" style={{ width: 200 }} value={selectedProjectId} onChange={setSelectedProjectId}>
            {projects.map(p => <Option key={p.id} value={p.id}>{p.title}</Option>)}
          </Select>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} disabled={!selectedProjectId}>创建角色</Button>
      </div>
      <Card><Table columns={columns} dataSource={characters} rowKey="id" loading={loading} /></Card>

      <Modal title={editingCharacter ? '编辑角色' : '创建角色'} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={600}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="角色名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="角色描述"><TextArea rows={3} /></Form.Item>
          <Form.Item name="personality" label="性格特点"><TextArea rows={2} /></Form.Item>
          <Form.Item name="appearance" label="外观描述">
            <Space.Compact style={{ width: '100%' }}>
              <TextArea rows={2} style={{ flex: 1 }} />
              <Button icon={<RocketOutlined />} loading={generating[`character-${editingCharacter?.id}`]} onClick={() => editingCharacter && handleGenerateCharacterImage(editingCharacter.id)} disabled={!editingCharacter} title="AI生成外观">AI</Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="style" label="风格" initialValue="anime"><Select><Option value="anime">日系动漫</Option><Option value="manga">漫画</Option><Option value="realistic">写实</Option><Option value="cartoon">卡通</Option></Select></Form.Item>
        </Form>
      </Modal>

      <Drawer title="表情与动作" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={560}>
        <Tabs items={[
          {
            key: 'expressions', label: <span><SmileOutlined /> 表情 ({expressions.length})</span>,
            children: (
              <>
                <div style={{ marginBottom: 12, textAlign: 'right' }}><Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setExprModalOpen(true)}>添加表情</Button></div>
                <List dataSource={expressions} locale={{ emptyText: <Empty description="暂无表情" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  renderItem={(expr: any) => (
                    <List.Item actions={[
                      <Button type="link" size="small" icon={<RocketOutlined />} loading={generating[`expression-${expr.id}`]} onClick={() => handleGenerateExpressionImage(expr.id, selectedCharId!)}>AI</Button>,
                      <Popconfirm title="确定删除？" onConfirm={() => deleteExpression(expr.id)}><Button type="link" danger size="small" icon={<DeleteOutlined />} /></Popconfirm>
                    ]}>
                      <List.Item.Meta
                        avatar={expr.image_url ? <Image src={expr.image_url} width={40} height={40} style={{ borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 40, height: 40, background: '#f0f0f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SmileOutlined /></div>}
                        title={<Space>{expr.name}{expr.emotion && <Tag color={emotionColors[expr.emotion] || 'default'}>{expr.emotion}</Tag>}</Space>}
                        description={expr.description}
                      />
                    </List.Item>
                  )}
                />
              </>
            ),
          },
          {
            key: 'actions', label: <span><ThunderboltOutlined /> 动作 ({actions.length})</span>,
            children: (
              <>
                <div style={{ marginBottom: 12, textAlign: 'right' }}><Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setActionModalOpen(true)}>添加动作</Button></div>
                <List dataSource={actions} locale={{ emptyText: <Empty description="暂无动作" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  renderItem={(act: any) => (
                    <List.Item actions={[<Popconfirm title="确定删除？" onConfirm={() => deleteAction(act.id)}><Button type="link" danger size="small" icon={<DeleteOutlined />} /></Popconfirm>]}>
                      <List.Item.Meta
                        avatar={act.image_url ? <Image src={act.image_url} width={40} height={40} style={{ borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 40, height: 40, background: '#f0f0f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ThunderboltOutlined /></div>}
                        title={<Space>{act.name}<Tag>{act.category}</Tag></Space>}
                        description={act.description}
                      />
                    </List.Item>
                  )}
                />
              </>
            ),
          },
        ]} />
      </Drawer>

      <Modal title="添加表情" open={exprModalOpen} onOk={handleAddExpression} onCancel={() => setExprModalOpen(false)}>
        <Form form={exprForm} layout="vertical">
          <Form.Item name="name" label="表情名称" rules={[{ required: true }]}><Input placeholder="如：微笑、愤怒" /></Form.Item>
          <Form.Item name="emotion" label="情绪类型"><Select placeholder="选择情绪" allowClear><Option value="happy">开心</Option><Option value="sad">悲伤</Option><Option value="angry">愤怒</Option><Option value="surprised">惊讶</Option><Option value="fear">恐惧</Option><Option value="neutral">中性</Option></Select></Form.Item>
          <Form.Item name="description" label="描述"><Input /></Form.Item>
          <Form.Item name="image_url" label="图片URL"><Input /></Form.Item>
        </Form>
      </Modal>
      <Modal title="添加动作" open={actionModalOpen} onOk={handleAddAction} onCancel={() => setActionModalOpen(false)}>
        <Form form={actionForm} layout="vertical">
          <Form.Item name="name" label="动作名称" rules={[{ required: true }]}><Input placeholder="如：行走、奔跑" /></Form.Item>
          <Form.Item name="category" label="类别" initialValue="general"><Select><Option value="general">通用</Option><Option value="movement">移动</Option><Option value="combat">战斗</Option><Option value="emotion">情感</Option><Option value="interaction">交互</Option></Select></Form.Item>
          <Form.Item name="description" label="描述"><Input /></Form.Item>
          <Form.Item name="image_url" label="图片URL"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Characters;
