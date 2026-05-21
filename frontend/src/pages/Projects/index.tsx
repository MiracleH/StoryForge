import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Tag, Typography, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, DownloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../../stores';
import { useExport } from '../../hooks';
import { projectAPI } from '../../services/api';

const { Title, Text } = Typography;

const Projects: React.FC = () => {
  const navigate = useNavigate();
  const { projects, pagination, loading, fetchProjects, deleteProject } = useProjectStore();
  const { exportBlob } = useExport();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await deleteProject(id);
      message.success('删除成功');
      setSelectedRowKeys(prev => prev.filter(k => k !== id));
    } catch {
      message.error('删除失败');
    }
  };

  const handleBatchDelete = async () => {
    const ids = selectedRowKeys as number[];
    let success = 0;
    for (const id of ids) {
      try {
        await deleteProject(id);
        success++;
      } catch {}
    }
    message.success(`已删除 ${success} 个项目`);
    setSelectedRowKeys([]);
  };

  const handleBatchExport = async () => {
    const ids = selectedRowKeys as number[];
    for (const id of ids) {
      try {
        const response = await projectAPI.export(id);
        exportBlob(new Blob([response as any], { type: 'application/json' }), `project-${id}-export.json`);
      } catch {}
    }
    message.success(`已导出 ${ids.length} 个项目`);
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      draft: { color: 'default', text: '草稿' },
      in_progress: { color: 'processing', text: '进行中' },
      completed: { color: 'success', text: '已完成' },
      archived: { color: 'warning', text: '已归档' },
    };
    const { color, text } = statusMap[status] || { color: 'default', text: status };
    return <Tag color={color}>{text}</Tag>;
  };

  const columns = [
    {
      title: '项目名称', dataIndex: 'title', key: 'title',
      render: (text: string, record: any) => <a onClick={() => navigate(`/projects/${record.id}`)}>{text}</a>,
    },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => getStatusTag(s) },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (t: string) => new Date(t).toLocaleString() },
    {
      title: '操作', key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/projects/${record.id}`)}>查看</Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => navigate(`/projects/${record.id}/edit`)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Title level={2} style={{ margin: 0 }}>项目管理</Title>
          {selectedRowKeys.length > 0 && <Text type="secondary">已选 {selectedRowKeys.length} 项</Text>}
        </Space>
        <Space>
          {selectedRowKeys.length > 0 && (
            <>
              <Button icon={<DownloadOutlined />} onClick={handleBatchExport}>批量导出</Button>
              <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 个项目？`} onConfirm={handleBatchDelete}>
                <Button danger icon={<DeleteOutlined />}>批量删除</Button>
              </Popconfirm>
            </>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/projects/new')}>创建项目</Button>
        </Space>
      </div>
      <Card>
        <Table
          columns={columns}
          dataSource={projects}
          rowKey="id"
          loading={loading}
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          pagination={{ ...pagination, onChange: (page) => fetchProjects({ page, limit: pagination.limit }) }}
        />
      </Card>
    </div>
  );
};

export default Projects;
