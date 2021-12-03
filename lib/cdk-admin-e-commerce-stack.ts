import * as cdk from '@aws-cdk/core'
import * as ec2 from '@aws-cdk/aws-ec2' // import ec2 library 
import * as iam from '@aws-cdk/aws-iam' // import iam library for permissions
import * as dynamodb from '@aws-cdk/aws-dynamodb'
import {readFileSync} from 'fs';

export class AdminECommerceStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props)
    // Get the default VPC. This is the network where your instance will be provisioned
    // All activated regions in AWS have a default vpc. 
    // You can create your own of course as well. https://aws.amazon.com/vpc/
    const defaultVpc = ec2.Vpc.fromLookup(this, 'VPC', { isDefault: true })

    // Lets create a role for the instance
    // You can attach permissions to a role and determine what your
    // instance can or can not do
    const role = new iam.Role(
      this,
      'ec2-admin-e-commerce-role', // this is a unique id that will represent this resource in a Cloudformation template
      { assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com') }
    )

    // lets create a security group for our instance
    // A security group acts as a virtual firewall for your instance to control inbound and outbound traffic.
    const securityGroup = new ec2.SecurityGroup(
      this,
      'ec2-admin-e-commerce-sg',
      {
        vpc: defaultVpc,
        allowAllOutbound: true, // will let your instance send outboud traffic
        securityGroupName: 'ec2-admin-e-commerce-sg',
      }
    )

    // lets use the security group to allow inbound traffic on specific ports
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allows SSH access from Internet'
    )

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allows HTTP access from Internet'
    )

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allows HTTPS access from Internet'
    )

    // Finally lets provision our ec2 instance
    const instance = new ec2.Instance(this, 'ec2-admin-e-commerce', {
      vpc: defaultVpc,
      role: role,
      securityGroup: securityGroup,
      instanceName: 'ec2-admin-e-commerce',
      instanceType: ec2.InstanceType.of( // t2.micro has free tier usage in aws
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),

      keyName: 'ec2-admin-e-commerce-key', // we will create this in the console before we deploy
    })

    // cdk lets us output properties of the resources we create after they are created
    // we want the ip address of this new instance so we can ssh into it later
    new cdk.CfnOutput(this, 'ec2-admin-e-commerce-output', {
      value: instance.instancePublicIp
    })

    // 👇 load user data script
    const userDataScript = readFileSync('./lib/start-server.sh', 'utf8');

    // 👇 add user data to the EC2 instance
    instance.addUserData(userDataScript);

    // 👇 create Dynamodb table
    const table = new dynamodb.Table(this, id, {
      tableName: "admins",
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: { name: "email", type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: true,
    })

    // 👇 grant the lambda role read permissions to our table
    table.grantReadData(role)
  }
}
