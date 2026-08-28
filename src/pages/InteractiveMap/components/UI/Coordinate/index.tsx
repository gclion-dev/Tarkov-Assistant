import './style.less';

interface CoordinateProps {
  position: InteractiveMap.Position2D;
}

const Index = (props: CoordinateProps) => {
  const { position } = props;

  return (
    <div className="im-coordinate">
      <span>{position.x.toFixed(1)}</span>
      <span>{position.y.toFixed(1)}</span>
    </div>
  );
};

export default Index;
